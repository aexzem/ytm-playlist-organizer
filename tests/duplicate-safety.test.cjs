const test = require('node:test');
const assert = require('node:assert/strict');
const dom = require('../dom_contract.js');
const { contentHarness, track, removalFixture, classList } = require('./helpers.cjs');

test('duration uses visible clock text; title/artist still use aria-label', () => {
  const row = { querySelector(selector) {
    return selector === dom.selectors.trackDuration
      ? { textContent: ' 2:46 ', getAttribute: () => '2 minutes, 46 seconds' }
      : { textContent: 'visible', getAttribute: () => 'accessible name' };
  } };
  const data = dom.getTrackData(row);
  assert.equal(data.duration, '2:46');
  assert.equal(data.rawTitle, 'accessible name');
  assert.equal(data.rawArtist, 'accessible name');
  assert.equal(contentHarness().Util.parseDuration(data.duration), 166);
});

test('duration parser validates both clocks, zero and malformed input', () => {
  const { Util } = contentHarness();
  for (const [input, seconds] of [['2:46',166], ['1:02:03',3723], ['62:03',3723], [' 0:00 ',0]]) assert.equal(Util.parseDuration(input), seconds);
  for (const input of [null, undefined, '', 0, {}, [], '2 minutes, 46 seconds', '2:6', '2:60', '1:60:00', '-1:02', '1.5:02', 'Infinity:00', '1:02:03:04', '999999999999999999:00']) assert.equal(Util.parseDuration(input), null);
});

test('duration guard rejects long gaps and unknowns, including either ordering', () => {
  const h = contentHarness();
  const groups = (a, b) => h.PlaylistProcessor.detectDuplicates([track(h, 'Same Song', a), track(h, 'Same Song', b, 1)]).length;
  assert.equal(groups('2:00', '8:00'), 0);
  assert.equal(groups('2:00', '2:15'), 1);
  assert.equal(groups('2:00', '2:16'), 0);
  assert.equal(groups('0:00', '0:16'), 0);
  assert.equal(groups('', '2:00'), 0);
  assert.equal(groups('2:00', ''), 0);
  assert.equal(groups('', ''), 0);
});

test('scan reports excluded unknown durations without an all-clear claim', async () => {
  const h = contentHarness();
  const emptyText = {};
  h.UIManager.el.dupEmpty = { classList: classList(), querySelector: () => emptyText };
  h.PlaylistProcessor.extractTracks = () => [track(h, 'Song', '')];
  await h.InteractionHandler._runDupScan();
  assert.match(h.UIManager.el.dupSubtitle.textContent, /1 track excluded: unknown duration/);
  assert.match(emptyText.textContent, /known durations/);
  assert.equal(h.timers.size, 0);
});

test('remove menu selector ignores hidden/stale options', () => {
  const item = options => ({ isConnected: true, getClientRects: () => [{}], closest: () => null,
    querySelector: () => ({ getAttribute: () => 'M14.25 2.25h-3V1.5 rest' }), ...options });
  const hidden = item({ getClientRects: () => [] });
  const ariaHidden = item({ closest: () => ({}) });
  const detached = item({ isConnected: false });
  const invisible = item({ invisible: true });
  const visible = item({});
  const doc = { querySelectorAll: () => [hidden, ariaHidden, detached, invisible, visible], defaultView: { getComputedStyle: el => ({ visibility: el.invisible ? 'hidden' : 'visible' }) } };
  assert.equal(dom.getRemoveMenuItem(doc), visible);
});

test('missing action menu stops batch, preserves selections and never claims success', async () => {
  const h = contentHarness(); const f = removalFixture(h, 2);
  h.context.window.__ytmeDom.getActionMenuButton = () => null;
  await h.InteractionHandler._confirmDelete();
  assert.equal(f.removeClicks, 0);
  assert.equal(h.State.selectedDups.size, 2);
  assert.match(h.UIManager.el.dupSubtitle.textContent, /STOPPED — 0\/2.*Track menu not found/);
  assert.equal(h.UIManager.el.btnConfirmDel.disabled, false);
});

test('missing remove option and pre-existing menu never click remove', async () => {
  for (const preExisting of [false, true]) {
    const h = contentHarness(); const f = removalFixture(h);
    if (preExisting) f.visible = true;
    else h.context.window.__ytmeDom.getRemoveMenuItem = () => null;
    await h.InteractionHandler._confirmDelete();
    assert.equal(f.removeClicks, 0);
    assert.equal(h.State.selectedDups.size, 1);
    assert.match(h.UIManager.el.dupSubtitle.textContent, /STOPPED/);
  }
});

test('click exception is not reported as removal', async () => {
  const h = contentHarness(); const f = removalFixture(h);
  f.onRemove = () => { throw new Error('blocked'); };
  await h.InteractionHandler._confirmDelete();
  assert.equal(h.State.selectedDups.size, 1);
  assert.match(h.UIManager.el.dupSubtitle.textContent, /0\/1.*action failed/);
});

test('delayed removal succeeds only after row detaches', async () => {
  const h = contentHarness(); const f = removalFixture(h);
  let polls = 0;
  h.onSleep = ms => { if (ms === 100 && ++polls === 3) f.detach(f.tracks[0]); };
  await h.InteractionHandler._confirmDelete();
  assert.equal(polls, 3);
  assert.equal(f.removeClicks, 1);
  assert.equal(h.State.selectedDups.size, 0);
  assert.match(h.UIManager.el.dupSubtitle.textContent, /1\/1 removals confirmed in page/);
});

test('timeout waits 5 seconds and never retries automatically', async () => {
  const h = contentHarness(); const f = removalFixture(h, 2);
  let elapsed = 0;
  h.onSleep = ms => { if (f.removeClicks) elapsed += ms; };
  await h.InteractionHandler._confirmDelete();
  assert.equal(elapsed, 5000);
  assert.equal(f.removeClicks, 1);
  assert.equal(h.State.selectedDups.size, 2);
  assert.match(h.UIManager.el.dupSubtitle.textContent, /not confirmed within 5 seconds/);
});

test('partial success counts only detached rows and retains remaining selection', async () => {
  const h = contentHarness(); const f = removalFixture(h, 3);
  f.onRemove = item => { if (f.removeClicks === 1) f.detach(item); };
  await h.InteractionHandler._confirmDelete();
  assert.equal(f.removeClicks, 2);
  assert.deepEqual([...h.State.selectedDups], [0, 1]);
  assert.match(h.UIManager.el.dupSubtitle.textContent, /STOPPED — 1\/3/);
});

test('double activation starts only one deletion batch', async () => {
  const h = contentHarness(); const f = removalFixture(h);
  let release;
  h.onSleep = () => new Promise(resolve => { release = resolve; });
  const first = h.InteractionHandler._confirmDelete();
  await h.InteractionHandler._confirmDelete();
  assert.equal(f.menuClicks, 0);
  assert.equal(h.UIManager.el.btnRescan.disabled, true);
  h.onSleep = null; f.onRemove = item => f.detach(item); release();
  await first;
  assert.equal(f.removeClicks, 1);
});

test('navigation and container replacement are never proof of removal', async () => {
  for (const mode of ['url', 'container', 'disconnected', 'moved']) {
    const h = contentHarness(); const f = removalFixture(h);
    f.onRemove = item => {
      if (mode === 'moved') f.rows.delete(item.element);
      else {
        f.detach(item);
        if (mode === 'url') h.context.window.location.href = 'https://music.youtube.com/';
        if (mode === 'container') h.context.window.__ytmeDom.getPlaylistContents = () => ({ isConnected: true });
        if (mode === 'disconnected') f.contents.isConnected = false;
      }
    };
    await h.InteractionHandler._confirmDelete();
    assert.equal(h.State.selectedDups.size, 1, mode);
    assert.match(h.UIManager.el.dupSubtitle.textContent, /STOPPED — 0\/1/, mode);
  }
});

test('navigation before menu click cancels destructive actions', async () => {
  const h = contentHarness(); const f = removalFixture(h);
  h.onSleep = () => { h.context.window.location.href = 'https://music.youtube.com/'; };
  await h.InteractionHandler._confirmDelete();
  assert.equal(f.menuClicks, 0);
  assert.equal(f.removeClicks, 0);
});

test('closing or replacing modal cannot write stale results or continue clicks', async () => {
  const h = contentHarness(); const f = removalFixture(h, 2);
  const oldSubtitle = h.UIManager.el.dupSubtitle;
  h.onSleep = () => {
    h.InteractionHandler._closeDupModal();
    h.UIManager.el = { dupSubtitle: { textContent: 'NEW MODAL' } };
  };
  await h.InteractionHandler._confirmDelete();
  assert.equal(f.menuClicks, 0);
  assert.equal(f.removeClicks, 0);
  assert.equal(h.UIManager.el.dupSubtitle.textContent, 'NEW MODAL');
  assert.equal(oldSubtitle.textContent, '');
});

test('retry validates detached and recycled rows before opening menus', async () => {
  for (const recycled of [false, true]) {
    const h = contentHarness(); const f = removalFixture(h);
    if (recycled) f.tracks[0].element.data = { ...f.tracks[0], rawTitle: 'Another song' };
    else f.detach(f.tracks[0]);
    await h.InteractionHandler._confirmDelete();
    assert.equal(f.menuClicks, 0);
    assert.equal(h.State.selectedDups.size, 1);
  }
});

test('modal restores previous overflow even without overlay; repeated cleanup is harmless', () => {
  const h = contentHarness();
  h.InteractionHandler._runDupScan = () => {};
  h.InteractionHandler._closeDupModal();
  assert.equal(h.context.document.body.style.overflow, 'auto');
  h.InteractionHandler._openDupModal(); h.InteractionHandler._openDupModal();
  assert.equal(h.context.document.body.style.overflow, 'hidden');
  delete h.UIManager.el.dupOverlay;
  h.InteractionHandler._closeDupModal();
  assert.equal(h.context.document.body.style.overflow, 'auto');
  h.context.document.body.style.overflow = 'scroll';
  h.InteractionHandler._closeDupModal();
  assert.equal(h.context.document.body.style.overflow, 'scroll');
});

test('SPA reset restores scrolling and clears selections', async () => {
  const h = contentHarness();
  h.InteractionHandler._runDupScan = () => {};
  h.InteractionHandler._openDupModal();
  h.State.selectedDups.add(1);
  h.context.window.location.href = 'https://music.youtube.com/';
  await h.Enhancer.softReset();
  assert.equal(h.context.document.body.style.overflow, 'auto');
  assert.equal(h.State.selectedDups.size, 0);
});

test('scan error restores scrolling and releases progress timer', async () => {
  const h = contentHarness();
  h.InteractionHandler._savedOverflow = { body: h.context.document.body, value: 'auto' };
  h.context.document.body.style.overflow = 'hidden';
  h.PlaylistProcessor.extractTracks = () => [];
  h.PlaylistProcessor.detectDuplicates = () => { throw new Error('scan failed'); };
  await h.InteractionHandler._runDupScan();
  assert.equal(h.context.document.body.style.overflow, 'auto');
  assert.equal(h.timers.size, 0);
});

test('closing during an active scan prevents late state writes and releases timer', async () => {
  const h = contentHarness();
  let detections = 0;
  h.PlaylistProcessor.extractTracks = () => [];
  h.PlaylistProcessor.detectDuplicates = () => { detections++; return []; };
  h.onSleep = ms => {
    if (ms === 60) {
      h.InteractionHandler._closeDupModal();
      h.State.dupGroups = ['new state'];
    }
  };
  await h.InteractionHandler._runDupScan();
  assert.equal(detections, 0);
  assert.deepEqual(h.State.dupGroups, ['new state']);
  assert.equal(h.timers.size, 0);
});

test('close during removal confirmation stops remaining batch and preserves new modal state', async () => {
  const h = contentHarness(); const f = removalFixture(h, 2);
  h.onSleep = ms => {
    if (ms === 100) {
      h.InteractionHandler._closeDupModal();
      h.State.selectedDups = new Set([99]);
      h.UIManager.el.dupSubtitle.textContent = 'NEW SCAN';
      f.detach(f.tracks[1]);
    }
  };
  await h.InteractionHandler._confirmDelete();
  assert.equal(f.removeClicks, 1);
  assert.deepEqual([...h.State.selectedDups], [99]);
  assert.equal(h.UIManager.el.dupSubtitle.textContent, 'NEW SCAN');
});
