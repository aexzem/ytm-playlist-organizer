const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function loadScript(file, context, names) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const end = source.lastIndexOf('\n}');
  vm.createContext(context);
  // Expose lexical declarations only in this VM; execute the real script body.
  vm.runInContext(source.slice(0, end) + `\nglobalThis.api = {${names.join(',')}};` + source.slice(end), context, { filename: file });
  return context.api;
}

function classList() {
  const values = new Set();
  return { add: x => values.add(x), remove: x => values.delete(x), contains: x => values.has(x) };
}

function contentHarness() {
  const shadow = { querySelectorAll: () => [] };
  const host = { attachShadow: () => shadow, style: { setProperty() {} }, remove() {} };
  let now = 0;
  const timers = new Set();
  const context = {
    console: { log() {}, warn() {}, error() {} },
    window: { location: { href: 'https://music.youtube.com/playlist?list=TEST' }, __ytmeDom: { selectors: {} } },
    document: { createElement: () => host, body: { style: { overflow: 'auto' }, contains: () => false } },
    chrome: { storage: { local: { get() {} } }, runtime: { onMessage: { addListener() {} } } },
    setTimeout, clearTimeout,
    setInterval: callback => { timers.add(callback); return callback; },
    clearInterval: callback => timers.delete(callback),
    Date: { now: () => now },
    confirm: () => true,
    PointerEvent: class {}, MouseEvent: class {}, AbortController,
  };
  const api = loadScript('content.js', context, ['Util', 'Config', 'State', 'PlaylistProcessor', 'InteractionHandler', 'UIManager', 'Enhancer', 'DOMObserver']);
  const h = { context, ...api, shadow, timers, onSleep: null };
  api.Util.sleep = async ms => { now += ms; await h.onSleep?.(ms, now); };
  api.UIManager.el = {
    dupSubtitle: { textContent: '' },
    dupBody: { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] },
    dupOverlay: { classList: classList() },
    btnConfirmDel: {}, btnRemoveSel: {}, btnRescan: {}, btnSelectAll: {}, btnAutoKeep: {},
  };
  return h;
}

function track(h, title, duration, idx = 0, artist = 'Same Artist') {
  return { rawTitle: title, rawArtist: artist, duration, idx,
    normTitle: h.Util.normalizeStr(title), normArtist: h.Util.normalizeStr(artist),
    versionTag: h.Util.getVersionTag(title) };
}

function removalFixture(h, count = 1) {
  const rows = new Set();
  const contents = { isConnected: true, contains: row => rows.has(row) };
  const fixture = { contents, rows, menuClicks: 0, removeClicks: 0, visible: false, onRemove: null, onMenu: null };
  fixture.tracks = Array.from({ length: count }, (_, idx) => {
    const item = track(h, 'Same Song', '2:00', idx);
    item.element = { isConnected: true, scrollIntoView() {}, dispatchEvent() {}, data: item };
    rows.add(item.element);
    return item;
  });
  fixture.detach = item => { rows.delete(item.element); item.element.isConnected = false; };
  const dom = h.context.window.__ytmeDom;
  dom.getPlaylistContents = () => contents;
  dom.getTrackData = row => row.data;
  dom.getActionMenuButton = row => ({ click() { fixture.menuClicks++; fixture.visible = true; fixture.target = row; fixture.onMenu?.(); } });
  dom.getRemoveMenuItem = () => fixture.visible ? { click() {
    fixture.removeClicks++;
    fixture.visible = false;
    fixture.onRemove?.(fixture.target.data);
  } } : null;
  h.State.dupGroups = [{ tracks: fixture.tracks }];
  h.State.selectedDups = new Set(fixture.tracks.map(t => t.idx));
  return fixture;
}

function tagHarness(initial = {}, shared = {}) {
  const storage = shared.storage || { data: structuredClone(initial) };
  let failWrite = false;
  const events = [];
  const runtime = {};
  const context = {
    console: { log() {}, warn() {}, error() {} },
    window: { location: { search: '?list=TEST' }, dispatchEvent: event => events.push(event) },
    chrome: { runtime, storage: { local: {
      get(keys, callback) {
        const data = storage.data;
        const result = keys === null ? data : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, data[key]]));
        queueMicrotask(() => callback(structuredClone(result)));
      },
      set(updates, callback) {
        queueMicrotask(() => {
          if (failWrite) runtime.lastError = { message: 'quota exceeded' };
          else Object.assign(storage.data, structuredClone(updates));
          callback();
          delete runtime.lastError;
        });
      },
    } } },
    setTimeout, clearTimeout, URLSearchParams,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    fetch: () => { throw new Error('Tests must not access the network'); },
  };
  if (shared.locks) context.navigator = { locks: shared.locks };
  const api = loadScript('tagger.js', context, ['TagStore', 'GenreClassifier']);
  return { ...api, context, events, data: () => structuredClone(storage.data), failWrites: value => { failWrite = value; } };
}

module.exports = { contentHarness, track, removalFixture, tagHarness, classList };
