if (window.__ytmeEnhancerLoaded) {
  console.warn('[YTM-Enhancer] Content script already loaded; skipping re-init.');
} else {
  window.__ytmeEnhancerLoaded = true;

  'use strict'; // keeps things honest

const Config = Object.freeze({
  selectors: {
    searchBox:       window.__ytmeDom.selectors.searchBox,
    trackRow:        window.__ytmeDom.selectors.trackRows,
    trackTitle:      window.__ytmeDom.selectors.trackTitle,
    trackArtist:     window.__ytmeDom.selectors.trackArtist,
    trackDuration:   window.__ytmeDom.selectors.trackDuration,
    trackThumb:      window.__ytmeDom.selectors.trackThumb,
    playlistTitle:   window.__ytmeDom.selectors.playlistTitle,
    actionMenu:      window.__ytmeDom.selectors.actionMenu,
    playlistShelf:   window.__ytmeDom.selectors.playlistShelf,
  },
  thresholds: {
    dupTitleSim:   0.96,
    dupArtistSim:  0.92,
    dupRemixTitle: 0.88,
    dupRemixArtist:0.90,
    dupDurationGap:15,    // seconds
    dupMinTitleLen:4,
  },
  lazy: {
    maxAttempts:   200,
    waitMs:        350,
    maxStall:      12,
    stallWaitMs:   600,
  },
  highlight: {
    color:    'rgba(59,130,246,0.35)',
    duration: 2200,
  },
  tagGenres: ['Rock','Indie','Pop','Electronic','R&B','Metal','Classical','Jazz','Hip-Hop','Nightcore','Cover'],
});

var host   = typeof host   !== 'undefined' ? host   : document.createElement('div');
var shadow = typeof shadow !== 'undefined' ? shadow : host.attachShadow({ mode: 'open' });

const YTME_THEMES = {
  'default':        { bg: '#030407', accent: '#00f0ff', text: '#e0e0e0' },
  'twilight-patch': { bg: '#1C175C', accent: '#F3AB33', text: '#e0e0e0' },
  'deep-ocean':     { bg: '#0F172A', accent: '#F97316', text: '#e0e0e0' },
  'snowy':          { bg: '#F8FAFC', accent: '#C85A00', text: '#1F2937' },
  'ice':            { bg: '#F0F9FF', accent: '#6B21A8', text: '#1F2937' },
  'matcha':         { bg: '#FDF6E3', accent: '#15803D', text: '#1F2937' },
};

function applyThemeToHost(themeId) {
  const theme = YTME_THEMES[themeId] || YTME_THEMES['default'];
  host.style.setProperty('--ytme-accent', theme.accent);
  host.style.setProperty('--ytme-bg', theme.bg);
  host.style.setProperty('--ytme-text', theme.text);
  host.style.setProperty('--ytme-border', `color-mix(in srgb, ${theme.text} 15%, transparent)`);
}

chrome.storage.local.get(['ytme_settings', 'ytme_theme'], data => {
  const themeId = data.ytme_theme || 'default';
  applyThemeToHost(themeId);
  const theme = YTME_THEMES[themeId] || YTME_THEMES['default'];
  document.documentElement.style.setProperty('--ytme-bg', theme.bg);
  document.documentElement.style.setProperty('--ytme-accent', theme.accent);
  document.documentElement.style.setProperty('--ytme-text', theme.text);
  document.documentElement.style.setProperty('--ytme-border', `color-mix(in srgb, ${theme.text} 15%, transparent)`);
  const s = data.ytme_settings || {};
  window.__ytme = {
    searchEnabled:     s.toggleSearch     !== false,
    duplicatesEnabled: s.toggleDuplicates !== false,
    autoloadEnabled:   s.toggleAutoload   !== false,
  };
  if (Array.isArray(s.activeGenres) && s.activeGenres.length) {
    State.activeGenres = s.activeGenres;
  }
  Enhancer.init();
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'SETTINGS_UPDATED') location.reload();
});

const State = {
  allTracks:    [],
  activeGenres: [],
  dupGroups:    [],
  dupSkippedDuration: 0,
  selectedDups: new Set(),
};

const Util = {
  sleep: ms => new Promise(r => setTimeout(r, ms)),

  normalizeStr(s) {
    return (s || '').toLowerCase()
      .replace(/\s*[\(\[【].*?[\)\]】]\s*/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  parseDuration(str) {
    if (typeof str !== 'string' || !/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(str.trim())) return null;
    const parts = str.trim().split(':').map(Number);
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return Number.isSafeInteger(seconds) ? seconds : null;
  },

  strSimilarity(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const longer  = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    return (longer.length - Util._levenshtein(longer, shorter)) / longer.length;
  },

  _levenshtein(a, b) {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = i;
      for (let j = 1; j <= b.length; j++) {
        const val = a[i-1] === b[j-1] ? dp[j-1] : Math.min(dp[j-1], dp[j], prev) + 1;
        dp[j-1] = prev; prev = val;
      }
      dp[b.length] = prev;
    }
    return dp[b.length];
  },

  getVersionTag(rawTitle) {
    const t = rawTitle.toLowerCase();
    if (/\b(remix|rmx|edit|bootleg)\b/.test(t))              return 'remix';
    if (/\b(live|concert|tour|session|acoustic)\b/.test(t))  return 'live';
    if (/\b(cover|tribute|karaoke)\b/.test(t))               return 'cover';
    if (/\b(instrumental|inst\.?)\b/.test(t))                return 'instrumental';
    return null;
  },
};

const PlaylistProcessor = {
  _loadPromise: null,
  _autoloadBlockedAt: null,

  // grabs all tracks from DOM, stays in the shelf or YTM's suggestion rows sneak in
  extractTracks() {
    try {
      // gotta lock to the shelf, otherwise it picks up autocomplete junk
      const els = window.__ytmeDom.getTrackElements(document);
      // skip empty placeholder rows YTM likes to render for no reason
      return els.map((el, idx) => {
        const { rawTitle, rawArtist, duration, thumb } = window.__ytmeDom.getTrackData(el, idx);

        return {
          idx, element: el, rawTitle, rawArtist, duration, thumb,
          normTitle:  Util.normalizeStr(rawTitle),
          normArtist: Util.normalizeStr(rawArtist),
          versionTag: Util.getVersionTag(rawTitle),
        };
      });
    } catch (err) {
      console.error('[YTM-Enhancer] extractTracks failed:', err);
      return [];
    }
  },

  /** @returns {number} */
  getCurrentCount() {
    return window.__ytmeDom.getTrackElements(document).length;
  },

  /** @returns {number|null} */
  getExpectedCount() {
    return window.__ytmeDom.getExpectedCount(document);
  },

  // silently exposes YTM's continuation sentinel until every available row is loaded
  async loadAll(autoloadEnabled) {
    if (!autoloadEnabled) return { complete: false, exhausted: false, count: this.getCurrentCount() };
    if (this._loadPromise) return this._loadPromise;

    const current = this.getCurrentCount();
    if (this._autoloadBlockedAt === current) {
      return { complete: false, exhausted: true, count: current };
    }

    this._loadPromise = this._loadAllTracks();
    try {
      return await this._loadPromise;
    } finally {
      this._loadPromise = null;
    }
  },

  async _loadAllTracks() {

    const { maxAttempts, waitMs, maxStall, stallWaitMs } = Config.lazy;
    let lastCount = this.getCurrentCount(), stalledRounds = 0, attempts = 0;
    // console.log('[YTM-Enhancer] Loading tracks. Expected:', this.getExpectedCount()); 
    console.log('[YTM-Enhancer] Loading tracks. Expected:', this.getExpectedCount());

    while (attempts++ < maxAttempts) {
      const count    = this.getCurrentCount();
      const expected = this.getExpectedCount();
      if (expected !== null && count >= expected) {
        this._autoloadBlockedAt = null;
        return { complete: true, exhausted: false, count };
      }

      if (!this._scrollToLoad()) {
        this._autoloadBlockedAt = count;
        return { complete: false, exhausted: true, count };
      }
      await Util.sleep(waitMs);

      const newCount = this.getCurrentCount();
      if (newCount > lastCount) {
        stalledRounds = 0;
        lastCount     = newCount;
      } else if (++stalledRounds >= maxStall) {
        await Util.sleep(stallWaitMs);
        const finalCount = this.getCurrentCount();
        const finalExpected = this.getExpectedCount();
        const complete = finalExpected !== null && finalCount >= finalExpected;
        this._autoloadBlockedAt = complete ? null : finalCount;
        return { complete, exhausted: !complete, count: finalCount };
      }
    }

    const finalCount = this.getCurrentCount();
    const finalExpected = this.getExpectedCount();
    const complete = finalExpected !== null && finalCount >= finalExpected;
    this._autoloadBlockedAt = complete ? null : finalCount;
    console.log(`[YTM-Enhancer] Total: ${finalCount} tracks`);
    return { complete, exhausted: !complete, count: finalCount };
  },

  _scrollToLoad() {
    return window.__ytmeDom.requestMoreTracks(document);
  },

  // finds duplicates by comparing title/artist similarity + duration gap
  detectDuplicates(tracks) {
    const { dupTitleSim, dupArtistSim, dupRemixTitle, dupRemixArtist, dupDurationGap, dupMinTitleLen } = Config.thresholds;
    const groups   = [];
    const assigned = new Set();

    for (let i = 0; i < tracks.length; i++) {
      if (assigned.has(i)) continue;
      const a     = tracks[i];
      const group = [a];
      let matchType = 'exact';

      for (let j = i + 1; j < tracks.length; j++) {
        if (assigned.has(j)) continue;
        const b = tracks[j];
        if (a.normTitle.length < dupMinTitleLen || b.normTitle.length < dupMinTitleLen) continue;

        const tSim = Util.strSimilarity(a.normTitle, b.normTitle);
        const aSim = Util.strSimilarity(a.normArtist, b.normArtist);
        const dA   = Util.parseDuration(a.duration);
        const dB   = Util.parseDuration(b.duration);
        if (dA === null || dB === null || Math.abs(dA - dB) > dupDurationGap) continue;

        if (tSim >= dupTitleSim && (aSim >= dupArtistSim || !a.normArtist || !b.normArtist)) {
          group.push(b); assigned.add(j);
          if (tSim < 1 || aSim < 1) matchType = 'fuzzy';
          continue;
        }
        if (tSim >= dupRemixTitle && aSim >= dupRemixArtist && (a.versionTag || b.versionTag)) {
          group.push(b); assigned.add(j); matchType = 'remix';
        }
      }

      if (group.length > 1) { assigned.add(i); groups.push({ tracks: group, matchType }); }
    }

    return groups;
  },
};

const UIManager = {
  el: {},

  build(searchEnabled, duplicatesEnabled) {
    try {
      shadow.innerHTML = this._template(searchEnabled, duplicatesEnabled);

      if (!document.getElementById('ytme-tag-picker-styles') && window.__ytmeTagger?.getTagPickerCSS) {
        const style = document.createElement('style');
        style.id = 'ytme-tag-picker-styles';
        style.textContent = window.__ytmeTagger.getTagPickerCSS();
        document.head.appendChild(style);
      }

      if (!document.getElementById('ytme-track-ui-styles')) {
        const style = document.createElement('style');
        style.id = 'ytme-track-ui-styles';
        style.textContent = `
          .ytme-genre-badge {
            position: relative;
          }
          .ytme-genre-badge[data-hover-tags]:not([data-hover-tags=""]) {
            cursor: help;
          }
          .ytme-genre-badge[data-hover-tags]:not([data-hover-tags=""])::after {
            content: attr(data-hover-tags);
            position: absolute;
            right: 0;
            bottom: calc(100% + 7px);
            z-index: 2147483646;
            width: max-content;
            max-width: min(260px, 70vw);
            padding: 6px 9px;
            border: 1px solid color-mix(in srgb, var(--ytme-accent) 24%, transparent);
            border-radius: 7px;
            background: color-mix(in srgb, var(--ytme-bg) 96%, transparent);
            box-shadow: 0 8px 24px rgba(0,0,0,.55);
            color: var(--ytme-text);
            font: 500 9px/1.4 'DM Mono', monospace;
            letter-spacing: .03em;
            white-space: normal;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(3px);
            transition: opacity .14s ease, transform .14s ease, visibility .14s;
          }
          .ytme-genre-badge[data-hover-tags]:not([data-hover-tags=""]):hover::after,
          .ytme-genre-badge[data-hover-tags]:not([data-hover-tags=""]):focus-visible::after {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
          }
        `;
        document.head.appendChild(style);
      }

      if (window.__ytmeTagger?.getTagPickerHTML && !document.getElementById('tag-picker')) {
        const temp = document.createElement('div');
        temp.innerHTML = window.__ytmeTagger.getTagPickerHTML();
        document.body.appendChild(temp.firstElementChild);
      }

      this._cacheRefs(searchEnabled, duplicatesEnabled);
    } catch (err) {
      console.error('[YTM-Enhancer] Failed to build shadow DOM:', err);
    }
  },

  // redraws the active filter pills in the header
  renderFilterIndicator() {
    shadow.querySelectorAll('.active-filter-tag').forEach(el => el.remove());
    const container = shadow.getElementById('enhancer-container');
    if (!container) return;

    State.activeGenres.forEach(genre => {
      const tag = document.createElement('button');
      tag.className = 'active-filter-tag';
      tag.innerHTML = `${genre} <span class="filter-tag-x">✕</span>`;
      tag.addEventListener('click', () => {
        State.activeGenres = State.activeGenres.filter(g => g !== genre);
        InteractionHandler.applyFilters();
        this.renderFilterIndicator();
        chrome.storage.local.get('ytme_settings', data => {
          const s = data.ytme_settings || {};
          s.activeGenres = State.activeGenres;
          chrome.storage.local.set({ ytme_settings: s });
        });
      });
      container.appendChild(tag);
    });
  },

  injectTrackUI(track) {
    const el = track?.element;
    if (!el) return;
    const existingTagUI = el.querySelector('.ytme-genre-badge');
    const existingTagBtn = el.querySelector('button[title="Tag this track"]');

    if (el.dataset.ytmeTagged === '1' && existingTagUI && existingTagBtn) {
        return;
    }


    if (existingTagUI) {
        existingTagUI.remove();
    }
    if (existingTagBtn) {
        existingTagBtn.remove();
    }

    el.dataset.ytmeTagged = '1';

    const fixedColumns = window.__ytmeDom.getFixedColumns(el);
    const durationEl   = el.querySelector(Config.selectors.trackDuration);
    if (!fixedColumns || !durationEl) return;

    // genre badge, shows the tag and updates after save
    const genreBadge = document.createElement('span');
    genreBadge.className = 'ytme-genre-badge';
    genreBadge.style.cssText = `
      font-family: 'DM Mono', monospace;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 99px;
      background: color-mix(in srgb, var(--ytme-accent) 12%, transparent);
      border: none;
      color: var(--ytme-accent);
      white-space: nowrap;
      flex-shrink: 0;
      align-self: center;
      margin-right: 5px;
      display: none;
      letter-spacing: 0.03em;
    `;
    UIManager._updateGenreBadge(genreBadge, track);

    const tagBtn = document.createElement('button');
    tagBtn.title = 'Tag this track';
    tagBtn.innerHTML = '🏷️';
    tagBtn.style.cssText = `
      background: color-mix(in srgb, var(--ytme-text) 5%, transparent);
      border: none;
      border-radius: 8px 2px 8px 2px;
      color: var(--ytme-text);
      cursor: pointer;
      font-size: 12px;
      padding: 2px 5px;
      opacity: 0;
      transition: opacity 0.15s ease;
      flex-shrink: 0;
      height: 22px;
      align-self: center;
      margin-right: 6px;
      line-height: 1;
      vertical-align: middle;
    `;

    el.addEventListener('mouseenter', () => { tagBtn.style.opacity = '1'; });
    el.addEventListener('mouseleave', () => { tagBtn.style.opacity = '0'; });

    fixedColumns.insertBefore(tagBtn, durationEl);
    fixedColumns.insertBefore(genreBadge, tagBtn);

    // Keep a reference so we can update the badge later
    el.dataset.ytmeBadgeId = track.idx;

    tagBtn.addEventListener('click', e => {
      e.stopPropagation();
      const freshTracks = PlaylistProcessor.extractTracks();
      const freshTrack  = freshTracks.find(t => t.element === el) || track;
      InteractionHandler.openTagPicker(freshTrack, tagBtn);
    });
  },

  _updateGenreBadge(badgeEl, track) {
    if (!badgeEl || !track) return;
    const tags = window.__ytmeTagger?.getTags(track);
    if (tags?.genres?.length) {
      const [first, ...rest] = tags.genres;
      const hoverTags = rest.slice(0, 4);
      badgeEl.textContent = rest.length ? `${first} +${rest.length}` : first;
      badgeEl.dataset.hoverTags = hoverTags.join(' • ');
      if (hoverTags.length) {
        badgeEl.tabIndex = 0;
        badgeEl.setAttribute('aria-label', `${first}; other tags: ${hoverTags.join(', ')}`);
      } else {
        badgeEl.removeAttribute('tabindex');
        badgeEl.removeAttribute('aria-label');
      }
      badgeEl.style.display = '';
    } else {
      badgeEl.dataset.hoverTags = '';
      badgeEl.removeAttribute('tabindex');
      badgeEl.removeAttribute('aria-label');
      badgeEl.style.display = 'none';
    }
  },

  // re-sync all badges after a tag change
  refreshAllBadges() {
    const freshTracks = PlaylistProcessor.extractTracks();
    freshTracks.forEach(track => {
      const el = track.element;
      if (!el) return;
      const badge = el.querySelector('.ytme-genre-badge');
      if (badge) this._updateGenreBadge(badge, track);
    });
  },

  injectAllTrackUI() {
    const tracks = PlaylistProcessor.extractTracks();
    tracks.forEach(t => this.injectTrackUI(t));
  },

  // scroll to track and flash it so you can actually find it
  goToTrack(element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.style.transition = `background-color 0.4s ease`;
    element.style.backgroundColor = Config.highlight.color;
    setTimeout(() => { element.style.backgroundColor = ''; }, Config.highlight.duration);
  },

  // ── Private ──────────────────────────────────────────

  _cacheRefs(searchEnabled, duplicatesEnabled) {
    const $ = id => shadow.getElementById(id);
    const $doc = id => document.getElementById(id); // outside shadow DOM
    this.el = {
      input:        searchEnabled     ? $('playlist-input')    : null,
      findDupBtn:   duplicatesEnabled ? $('find-duplicates')   : null,
      popup:        $('results-popup'),
      popupList:    $('popup-list'),
      popupTitle:   $('popup-title'),
      popupClose:   $('popup-close'),
      dupOverlay:   $('dup-overlay'),
      dupClose:     $('dup-close'),
      dupSubtitle:  $('dup-subtitle'),
      dupScanning:  $('dup-scanning'),
      scanLabel:    $('scan-label'),
      scanFill:     $('scan-progress-fill'),
      dupToolbar:   $('dup-toolbar'),
      dupBody:      $('dup-body'),
      dupEmpty:     $('dup-empty'),
      dupFooter:    $('dup-footer'),
      dupCountBadge:$('dup-count-badge'),
      selCount:     $('sel-count-label'),
      footerInfo:   $('footer-info'),
      btnSelectAll: $('btn-select-all'),
      btnAutoKeep:  $('btn-auto-keep'),
      btnRescan:    $('btn-rescan'),
      btnRemoveSel: $('btn-remove-selected'),
      btnCancel:    $('btn-cancel'),
      btnConfirmDel:$('btn-confirm-delete'),
      tagPicker:    $doc('tag-picker'),
      tagTitle:     $doc('tag-picker-title'),
      tagArtist:    $doc('tag-picker-artist'),
      tagPills:     $doc('tag-picker-pills'),
      tagSave:      $doc('tag-picker-save'),
      tagCancel:    $doc('tag-picker-cancel'),
      tagClear:     $doc('tag-picker-clear'),
      ctxMenu:      $('ytme-context-menu'),
      ctxTagBtn:    $('ctx-tag'),
    };
  },

  // TODO: It was my first time designing a UI, and I didn't liked. I will change it later.
  _template(searchEnabled, duplicatesEnabled) {
    const searchHTML = searchEnabled ? `
      <div id="enhancer-search-bar">
        <input type="text" id="playlist-input" placeholder="Query a track!">
      </div>` : '';
    const dupHTML = duplicatesEnabled ? `
      <button id="find-duplicates" title="Scan this playlist for duplicate tracks" aria-label="Scan this playlist for duplicate tracks"><span>⚡</span> SCAN</button>` : '';

    return `
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :host{--ytme-accent:#00f0ff}

  #enhancer-container{display:flex;align-items:center;flex-wrap:nowrap;min-width:0;max-width:min(100%,470px)}

  /* ── BORDERLESS SEARCH BAR ── */
  #enhancer-search-bar{
    position:relative; width:clamp(150px,22vw,220px); min-width:120px; height:36px; flex:0 1 auto;
    background:rgba(255,255,255,0.04);
    backdrop-filter:blur(24px);
    border:none;
    border-left: 1px solid color-mix(in srgb, var(--ytme-accent) 30%, transparent);
    border-radius: 12px 0 0 12px;
    clip-path:polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%);
    display:flex; align-items:center; padding:0 24px 0 14px; margin-left:15px;
    transition:width .3s cubic-bezier(0.16,1,0.3,1), background .2s;
  }
  #enhancer-search-bar:focus-within{width:clamp(190px,30vw,300px); background:rgba(255,255,255,0.08);}
  input{background:transparent; border:none; color:#fff; outline:none; width:100%; font-size:12px; font-family:'DM Mono',monospace;}
  ::placeholder{color:rgba(255,255,255,0.4); letter-spacing:0.1em;}

  /* ── DUPLICATE BUTTON ── */
  #find-duplicates{
    position:relative; height:36px; flex:0 0 auto;
    background:rgba(255,255,255,0.04);
    backdrop-filter:blur(24px);
    border:none;
    border-right: 1px solid rgba(255,255,255,0.2);
    border-radius: 0 12px 12px 0;
    clip-path:polygon(8% 0, 100% 0, 100% 100%, 8% 100%, 0 50%);
    display:flex; align-items:center; padding:0 16px 0 24px; margin-left:4px;
    color:#fff; cursor:pointer; font-size:11px; font-family:'DM Mono',monospace; font-weight:500; letter-spacing:0.1em;
    transition:color .2s, background .2s;
  }
  #find-duplicates:hover{background:rgba(255,255,255,0.1); color:#fff;}

  @media (max-width:700px){
    #enhancer-container{max-width:calc(100vw - 128px)}
    #enhancer-search-bar{width:clamp(120px,30vw,180px);margin-left:4px;padding-left:11px;padding-right:20px}
    #enhancer-search-bar:focus-within{width:clamp(145px,38vw,220px)}
    #find-duplicates{margin-left:2px;padding-left:18px;padding-right:12px}
  }

  @media (max-width:480px){
    #enhancer-container{max-width:calc(100vw - 92px)}
    #enhancer-search-bar{width:min(42vw,150px)}
    #enhancer-search-bar:focus-within{width:min(50vw,180px)}
    #find-duplicates{font-size:10px;padding-left:15px;padding-right:9px}
  }

  /* ── FILTER TAGS ── */
  .active-filter-tag{display:inline-flex;align-items:center;gap:6px;font-family:'DM Mono',monospace;font-size:9px;padding:4px 12px;background:color-mix(in srgb, var(--ytme-accent) 5%, transparent);color:var(--ytme-accent);border:none;clip-path:polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%);cursor:pointer;transition:background .2s;margin-left:8px;flex-shrink:0}
  .active-filter-tag:hover{background:color-mix(in srgb, var(--ytme-accent) 15%, transparent);}
  .filter-tag-x{font-size:8px;opacity:.5}

  /* ── RESULTS POPUP (GLASS & SHADOW) ── */
  #results-popup{display:none;position:fixed;top:64px;left:50%;transform:translateX(-50%);background:color-mix(in srgb, var(--ytme-bg) 95%, transparent);backdrop-filter:blur(40px);border:none;border-radius:12px;border-top:2px solid var(--ytme-accent);padding:0;min-width:400px;max-width:560px;max-height:400px;overflow-y:auto;z-index:2147483647;box-shadow:0 30px 60px rgba(0,0,0,0.9);scrollbar-width:none;}
  #results-popup::-webkit-scrollbar{display:none;}
  #results-popup.visible{display:block;}
  #popup-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 8px;background:color-mix(in srgb, var(--ytme-text) 2%, transparent);}
  #popup-title{font-family:'DM Mono',monospace;font-size:9px;color:color-mix(in srgb, var(--ytme-text) 30%, transparent);letter-spacing:0.2em;}
  #popup-close{background:none;border:none;color:color-mix(in srgb, var(--ytme-text) 30%, transparent);cursor:pointer;font-size:12px;transition:color .15s;}
  #popup-close:hover{color:var(--ytme-text);}
  
  .result-item{display:flex;align-items:center;gap:12px;padding:12px 20px;background:transparent;cursor:pointer;transition:all .2s;border-left:2px solid transparent;}
  .result-item:hover{background:color-mix(in srgb, var(--ytme-text) 3%, transparent);border-left-color:var(--ytme-accent);padding-left:24px;}
  .result-index{color:color-mix(in srgb, var(--ytme-text) 10%, transparent);font-size:9px;min-width:18px;text-align:right;font-family:'DM Mono',monospace;}
  .result-info{display:flex;flex-direction:column;gap:2px;overflow:hidden;}
  .result-title{color:color-mix(in srgb, var(--ytme-text) 90%, transparent);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'DM Sans',sans-serif;}
  .result-artist{color:color-mix(in srgb, var(--ytme-text) 30%, transparent);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'DM Mono',monospace;}
  .result-match-badge{margin-left:auto;font-size:8px;padding:3px 8px;background:color-mix(in srgb, var(--ytme-text) 3%, transparent);color:color-mix(in srgb, var(--ytme-text) 40%, transparent);letter-spacing:0.1em;font-family:'DM Mono',monospace;}

  /* ── DUPLICATE MODAL ── */
  #dup-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:2147483646;backdrop-filter:blur(10px);}
  #dup-overlay.visible{display:flex;align-items:center;justify-content:center;}
  #dup-modal{background:color-mix(in srgb, var(--ytme-bg) 95%, transparent);backdrop-filter:blur(40px);border:1px solid var(--ytme-border);border-radius:16px;width:min(720px,95vw);max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,1);}
  
  #dup-header{display:flex;align-items:center;justify-content:space-between;padding:24px 32px 20px;background:linear-gradient(180deg, color-mix(in srgb, var(--ytme-text) 2%, transparent) 0%, transparent 100%);}
  #dup-header-left{display:flex;flex-direction:column;gap:4px;}
  #dup-title{font-family:'DM Sans',sans-serif;font-size:16px;font-weight:600;color:var(--ytme-text);letter-spacing:0.05em;}
  #dup-subtitle{font-family:'DM Mono',monospace;font-size:9px;color:var(--ytme-accent);letter-spacing:0.2em;}
  #dup-close{background:none;border:none;color:color-mix(in srgb, var(--ytme-text) 30%, transparent);cursor:pointer;font-size:16px;transition:color .15s;}
  #dup-close:hover{color:var(--ytme-text);}
  
  #dup-scanning{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:64px 20px;gap:20px;}
  .scan-ring{width:40px;height:40px;border:1px solid var(--ytme-border);border-top-color:var(--ytme-accent);border-radius:50%;animation:spin 0.6s linear infinite;}
  #scan-label{font-family:'DM Mono',monospace;font-size:10px;color:color-mix(in srgb, var(--ytme-text) 40%, transparent);letter-spacing:0.15em;}
  #scan-progress-bar{width:200px;height:2px;background:var(--ytme-border);overflow:hidden;}
  #scan-progress-fill{height:100%;background:var(--ytme-accent);width:0%;transition:width 0.2s;}

  #dup-toolbar{display:none;align-items:center;justify-content:space-between;padding:12px 32px;background:color-mix(in srgb, var(--ytme-text) 1%, transparent);border-bottom:1px solid var(--ytme-border);}
  #dup-toolbar.visible{display:flex;}
  .toolbar-left, .toolbar-right{display:flex;align-items:center;gap:12px;}
  .dup-count-badge{font-family:'DM Mono',monospace;font-size:9px;color:var(--ytme-accent);padding:4px 8px;background:color-mix(in srgb, var(--ytme-accent) 5%, transparent);letter-spacing:0.1em;}
  .sel-count{font-family:'DM Mono',monospace;font-size:9px;color:color-mix(in srgb, var(--ytme-text) 40%, transparent);}
  
  .tb-btn{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;padding:8px 16px;cursor:pointer;border:none;background:color-mix(in srgb, var(--ytme-text) 3%, transparent);color:color-mix(in srgb, var(--ytme-text) 50%, transparent);transition:all .2s;border-radius:8px;}
  .tb-btn:hover{background:color-mix(in srgb, var(--ytme-text) 8%, transparent);color:var(--ytme-text);}
  .tb-btn-danger{background:rgba(239,68,68,0.05);color:#ef4444;}
  .tb-btn-danger:hover{background:rgba(239,68,68,0.15);}
  .tb-btn-danger:disabled{opacity:0.2;cursor:not-allowed;}

  #dup-body{overflow-y:auto;flex:1;scrollbar-width:none;}
  #dup-body::-webkit-scrollbar{display:none;}
  #dup-empty{display:none;flex-direction:column;align-items:center;justify-content:center;padding:64px 20px;gap:12px;}
  #dup-empty.visible{display:flex;}
  .empty-icon{font-size:24px;opacity:0.3;filter:grayscale(1);}
  .empty-text{font-family:'DM Mono',monospace;font-size:10px;color:color-mix(in srgb, var(--ytme-text) 40%, transparent);letter-spacing:0.1em;}

  .dup-group{margin-bottom:12px;}
  .dup-group-header{display:flex;align-items:center;gap:12px;padding:8px 32px;background:color-mix(in srgb, var(--ytme-text) 1%, transparent);}
  .group-label{font-family:'DM Mono',monospace;font-size:8px;color:color-mix(in srgb, var(--ytme-text) 30%, transparent);letter-spacing:0.2em;}
  
  .dup-track-row{display:flex;align-items:center;gap:16px;padding:12px 32px;background:transparent;border-left:2px solid transparent;cursor:pointer;transition:all .2s;}
  .dup-track-row:hover{background:color-mix(in srgb, var(--ytme-text) 2%, transparent);border-left-color:color-mix(in srgb, var(--ytme-text) 20%, transparent);}
  .dup-track-row.selected{background:rgba(239,68,68,0.03);border-left-color:#ef4444;}
  .dup-track-row.keep-row{background:color-mix(in srgb, var(--ytme-accent) 2%, transparent);border-left-color:var(--ytme-accent);}
  
  .track-checkbox{appearance:none;width:12px;height:12px;border:1px solid var(--ytme-border);border-radius:0;cursor:pointer;position:relative;}
  .track-checkbox:checked{background:#ef4444;border-color:#ef4444;}
  .keep-checkbox:checked{background:var(--ytme-accent);border-color:var(--ytme-accent);}
  
  .track-thumb{width:40px;height:40px;background:color-mix(in srgb, var(--ytme-text) 2%, transparent);display:flex;align-items:center;justify-content:center;font-size:10px;color:color-mix(in srgb, var(--ytme-text) 10%, transparent);overflow:hidden;}
  .track-info{flex:1;overflow:hidden;display:flex;flex-direction:column;gap:2px;}
  .track-title{font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ytme-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .track-meta{font-family:'DM Mono',monospace;font-size:9px;color:color-mix(in srgb, var(--ytme-text) 30%, transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  
  .track-tag{font-family:'DM Mono',monospace;font-size:8px;padding:4px 8px;letter-spacing:0.1em;}
  .tag-keep{color:var(--ytme-accent);background:color-mix(in srgb, var(--ytme-accent) 5%, transparent);}
  .tag-delete{color:#ef4444;background:rgba(239,68,68,0.05);}

  #dup-footer{display:none;align-items:center;justify-content:flex-end;gap:12px;padding:20px 32px;background:color-mix(in srgb, var(--ytme-text) 1%, transparent);}
  #dup-footer.visible{display:flex;}

  /* ── CONTEXT MENU ── */
  #ytme-context-menu{display:none;position:fixed;background:color-mix(in srgb, var(--ytme-bg) 95%, transparent);border:1px solid var(--ytme-border);padding:8px;z-index:2147483647;}
  #ytme-context-menu.visible{display:block;}
  .ctx-item{font-family:'DM Mono',monospace;font-size:10px;color:color-mix(in srgb, var(--ytme-text) 60%, transparent);background:none;border:none;padding:8px 12px;width:100%;text-align:left;cursor:pointer;text-transform:uppercase;letter-spacing:0.05em;}
  .ctx-item:hover{background:color-mix(in srgb, var(--ytme-text) 5%, transparent);color:var(--ytme-text);}

  @keyframes spin{to{transform:rotate(360deg)}}
</style>

<div id="enhancer-container">
  ${searchHTML}
  ${dupHTML}
</div>

<div id="ytme-context-menu">
  <button class="ctx-item" id="ctx-tag">Tag track</button>
</div>

<div id="results-popup">
  <div id="popup-header"><span id="popup-title">QUERY RESULTS</span><button id="popup-close">✕</button></div>
  <div id="popup-list"></div>
</div>

<div id="dup-overlay">
  <div id="dup-modal">
    <div id="dup-header">
      <div id="dup-header-left">
        <span id="dup-title">Duplicate Scanner</span>
        <span id="dup-subtitle">ANALYZING DATASTREAM…</span>
      </div>
      <button id="dup-close">✕</button>
    </div>
    <div id="dup-scanning">
      <div class="scan-ring"></div>
      <div id="scan-progress-bar"><div id="scan-progress-fill"></div></div>
      <span id="scan-label">INITIALIZING…</span>
    </div>
    <div id="dup-toolbar">
      <div class="toolbar-left">
        <span class="dup-count-badge" id="dup-count-badge">0 groups</span>
        <span class="sel-count" id="sel-count-label"></span>
      </div>
      <div class="toolbar-right">
        <button class="tb-btn" id="btn-select-all">Select All</button>
        <button class="tb-btn" id="btn-auto-keep">Auto Keep</button>
        <button class="tb-btn" id="btn-rescan">Rescan</button>
        <button class="tb-btn tb-btn-danger" id="btn-remove-selected" disabled>Delete Selected</button>
      </div>
    </div>
    <div id="dup-empty">
      <span class="empty-icon">✓</span>
      <span class="empty-text">Dupi-dupi can't find anything! You're all clear.</span>
    </div>
    <div id="dup-body"></div>
    <div id="dup-footer">
      <span class="footer-info" id="footer-info" style="font-family:'DM Mono',monospace;font-size:9px;color:color-mix(in srgb, var(--ytme-text) 30%, transparent);margin-right:auto;"></span>
      <button class="tb-btn" id="btn-cancel">Cancel</button>
      <button class="tb-btn tb-btn-danger" id="btn-confirm-delete" disabled>Execute Delete</button>
    </div>
  </div>
</div>`;
  },
};

const InteractionHandler = {
  _tagPickerTrack:    null,
  _tagPickerSelected: new Set(),
  _ctxTarget:         null,
  _ctxAnchor:         null,
  _globalBindingsAbort: null,
  _dupEpoch: 0,
  _deleteOperation: null,
  _savedOverflow: null,

  /** Wire up all event listeners after shadow DOM is ready. */
  bindAll() {
    const { el } = UIManager;
    this.releaseGlobalBindings();
    this._globalBindingsAbort = new AbortController();
    const globalListenerOptions = { signal: this._globalBindingsAbort.signal };

    // YTM intercepts keyboard events, stop that
    const stopYT = e => e.stopPropagation();
    if (el.input) {
      el.input.addEventListener('keydown',  stopYT);
      el.input.addEventListener('keyup',    stopYT);
      el.input.addEventListener('keypress', stopYT);
      el.input.addEventListener('input',    () => this._onSearch());
    }

    if (el.popupClose) el.popupClose.addEventListener('click', () => this._closePopup());

    if (el.findDupBtn)   el.findDupBtn.addEventListener('click',   () => this._openDupModal());
    if (el.dupClose)     el.dupClose.addEventListener('click',     () => this._closeDupModal());
    if (el.btnCancel)    el.btnCancel.addEventListener('click',    () => this._closeDupModal());
    if (el.dupOverlay)   el.dupOverlay.addEventListener('click',   e => { if (e.target === el.dupOverlay) this._closeDupModal(); });
    if (el.btnRescan)    el.btnRescan.addEventListener('click',    () => this._runDupScan());
    if (el.btnSelectAll) el.btnSelectAll.addEventListener('click', () => this._selectAllDups());
    if (el.btnAutoKeep)  el.btnAutoKeep.addEventListener('click',  () => this._autoKeepFirst());
    if (el.btnRemoveSel) el.btnRemoveSel.addEventListener('click', () => this._confirmDelete());
    if (el.btnConfirmDel)el.btnConfirmDel.addEventListener('click',() => this._confirmDelete());

    if (el.tagCancel) el.tagCancel.addEventListener('click', () => this._closeTagPicker());
    if (el.tagSave)   el.tagSave.addEventListener('click',   () => this._saveTag());
    if (el.tagClear)  el.tagClear.addEventListener('click',  () => this._clearTag());
    if (el.ctxTagBtn) el.ctxTagBtn.addEventListener('click', () => {
      el.ctxMenu?.classList.remove('visible');
      if (this._ctxTarget) this.openTagPicker(this._ctxTarget, this._ctxAnchor);
    });

    // close on outside click
    document.addEventListener('click', e => {
      if (!shadow.contains(e.target)) this._closePopup();
      if (el.ctxMenu?.classList.contains('visible') && !el.ctxMenu.contains(e.target)) el.ctxMenu.classList.remove('visible');
    }, globalListenerOptions);

    window.addEventListener('ytme:tags-updated', () => {
      UIManager.refreshAllBadges();
      if (State.activeGenres.length) this.applyFilters();
      try {
        chrome.runtime.sendMessage(
          { type: 'TAGS_UPDATED', stats: window.__ytmeTagger?.getStats(State.allTracks) },
          () => { chrome.runtime.lastError; }
        );
      } catch { /* popup not open */ }
    }, globalListenerOptions);
  },

  releaseGlobalBindings() {
    this._globalBindingsAbort?.abort();
    this._globalBindingsAbort = null;
  },

  // shows/hides tracks based on whats selected
  applyFilters() {
    const tracks = State.allTracks.length ? State.allTracks : PlaylistProcessor.extractTracks();
    if (!State.activeGenres.length) {
      window.__ytmeTagger?.clearFilters(tracks);
    } else {
      window.__ytmeTagger?.filterTracks(tracks, State.activeGenres);
    }
    UIManager.renderFilterIndicator();
    const trackElements = window.__ytmeDom.getTrackElements(document);
    return { visible: trackElements.filter(el => el.style.display !== 'none').length, total: trackElements.length };
  },


  openTagPicker(track, anchorEl) {
    if (!window.__ytmeTagger) return;
    const { el } = UIManager;
    if (!el.tagPicker) return;

    this._tagPickerTrack    = track;
    this._tagPickerSelected = new Set(window.__ytmeTagger.getTags(track)?.genres || []);

    if (el.tagTitle)  el.tagTitle.textContent  = track.rawTitle  || 'Unknown';
    if (el.tagArtist) el.tagArtist.textContent = track.rawArtist || '';

    if (el.tagPills) {
      el.tagPills.innerHTML = '';
      Config.tagGenres.forEach(genre => {
        const pill = document.createElement('button');
        pill.className   = 'tag-pill' + (this._tagPickerSelected.has(genre) ? ' selected' : '');
        pill.textContent = genre;
        pill.addEventListener('click', () => {
          this._tagPickerSelected.has(genre)
            ? (this._tagPickerSelected.delete(genre), pill.classList.remove('selected'))
            : (this._tagPickerSelected.add(genre),    pill.classList.add('selected'));
        });
        el.tagPills.appendChild(pill);
      });
    }

    const PICKER_W = 360;
    const PICKER_H = 320;
    const rect   = anchorEl.getBoundingClientRect();
    const margin = 8;

    // Align picker's right edge to anchor's right edge, so it opens to the left
    let left = rect.right - PICKER_W;
    let top  = rect.bottom + 12;

    left = Math.max(margin, Math.min(left, window.innerWidth  - PICKER_W - margin));
    if (top + PICKER_H > window.innerHeight - margin) top = rect.top - PICKER_H - 12;
    top  = Math.max(margin, top);

    el.tagPicker.style.top  = `${top}px`;
    el.tagPicker.style.left = `${left}px`;
    el.tagPicker.style.display = 'block';
  },

  // ── Private ──────────────────────────────────────────

  _closePopup() {
    UIManager.el.popup?.classList.remove('visible');
    if (UIManager.el.popupList) UIManager.el.popupList.innerHTML = '';
  },

  _closeTagPicker() {
    if (UIManager.el.tagPicker) UIManager.el.tagPicker.style.display = 'none';
    this._tagPickerTrack = null;
  },

  async _saveTag() {
    if (!this._tagPickerTrack || !window.__ytmeTagger) return;
    try {
      await window.__ytmeTagger.saveManualTag(this._tagPickerTrack, [...this._tagPickerSelected]);
    } catch (err) {
      console.error('[YTM-Enhancer] Failed to save manual tag:', err);
    }
    this._closeTagPicker();
  },

  async _clearTag() {
    if (!this._tagPickerTrack || !window.__ytmeTagger) return;
    try {
      await window.__ytmeTagger.removeManualTag(this._tagPickerTrack);
      window.dispatchEvent(new CustomEvent('ytme:tags-updated'));
    } catch (err) {
      console.error('[YTM-Enhancer] Failed to remove manual tag:', err);
    }
    this._closeTagPicker();
  },

  _onSearch() {
    const { el } = UIManager;
    const query = el.input?.value.trim().toLowerCase() || '';
    console.log('query:', query); 
    if (query.length < 2) { this._closePopup(); return; }

    // stay in the shelf, not YTM's suggestion dropdowns
    const tracks = window.__ytmeDom.getTrackElements(document).map(el => ({
      element: el,
      title: el.querySelector(Config.selectors.trackTitle)?.innerText.trim().toLowerCase() || '',
    }));
    if (!tracks.length) return;

    let results = [], matchType = 'starts';
    results = tracks.filter(t => t.title.startsWith(query));
    if (!results.length) { matchType = 'includes'; results = tracks.filter(t => t.title.includes(query)); }
    if (!results.length && typeof Fuse !== 'undefined') {
      matchType = 'fuzzy';
      const fuse = new Fuse(tracks, { keys: ['title'], threshold: 0.4, distance: 5, ignoreLocation: false, minMatchCharLength: 3, includeScore: true });
      results = fuse.search(query).filter(r => r.score < 0.6);
    }

    if (!results.length) { this._closePopup(); return; }
    if (results.length === 1) {
      const track = results[0].item ?? results[0];
      this._closePopup();
      UIManager.goToTrack(track.element);
      return;
    }
    this._showPopup(results, matchType);
  },

  _showPopup(results, matchType) {
    const { el } = UIManager;
    if (!el.popupList || !el.popupTitle || !el.popup) return;
    el.popupList.innerHTML = '';
    el.popupTitle.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} found`;
    results.forEach((r, i) => {
      const track = r.item ?? r;
      const type  = r.score !== undefined ? 'fuzzy' : matchType === 'starts' ? 'exact' : 'partial';
      const item  = document.createElement('div');
      item.className = 'result-item';
      const artist    = window.__ytmeDom.getArtist(track.element);
      const badge     = type === 'exact' ? 'badge-exact' : type === 'partial' ? 'badge-partial' : 'badge-fuzzy';
      const label     = type === 'exact' ? 'Exact'       : type === 'partial' ? 'Contains'      : 'Fuzzy';
      item.innerHTML  = `<span class="result-index">${i+1}</span><div class="result-info"><span class="result-title">${track.title}</span>${artist ? `<span class="result-artist">${artist}</span>` : ''}</div><span class="result-match-badge ${badge}">${label}</span>`;
      item.addEventListener('click', () => { this._closePopup(); UIManager.goToTrack(track.element); });
      el.popupList.appendChild(item);
    });
    el.popup.classList.add('visible');
  },

  _openDupModal() {
    const { el } = UIManager;
    if (!el.dupOverlay) return;
    el.dupOverlay.classList.add('visible');
    if (!this._savedOverflow) {
      this._savedOverflow = { body: document.body, value: document.body.style.overflow };
    }
    document.body.style.overflow = 'hidden';
    this._runDupScan();
  },

  _closeDupModal() {
    const { el } = UIManager;
    this._dupEpoch++;
    if (this._deleteOperation) this._deleteOperation.cancelled = true;
    el.dupOverlay?.classList.remove('visible');
    if (this._savedOverflow) {
      this._savedOverflow.body.style.overflow = this._savedOverflow.value;
      this._savedOverflow = null;
    }
    State.selectedDups.clear();
  },

  async _runDupScan() {
    const { el } = UIManager;
    if (!el.dupBody || (this._deleteOperation && !this._deleteOperation.cancelled)) return;
    const epoch = ++this._dupEpoch;
    const url = window.location.href;
    const current = () => epoch === this._dupEpoch && url === window.location.href && el === UIManager.el;
    let interval;
    try {
      el.dupBody.innerHTML = '';
      el.dupEmpty?.classList.remove('visible');
      el.dupToolbar?.classList.remove('visible');
      el.dupFooter?.classList.remove('visible');
      if (el.dupScanning) el.dupScanning.style.display = 'flex';
      if (el.dupSubtitle) el.dupSubtitle.textContent   = 'SCANNING PLAYLIST…';
      if (el.scanFill)    el.scanFill.style.width       = '0%';
      if (el.scanLabel)   el.scanLabel.textContent      = 'INITIALIZING…';
      State.selectedDups.clear();

      await Util.sleep(80);
      if (!current()) return;
      const tracks = PlaylistProcessor.extractTracks();
      State.dupSkippedDuration = tracks.filter(track => Util.parseDuration(track.duration) === null).length;
      if (el.scanLabel) el.scanLabel.textContent = `ANALYZING ${tracks.length} TRACKS…`;

      let progress = 0;
      interval = setInterval(() => {
        progress = Math.min(progress + Math.random() * 8, 85);
        if (el.scanFill) el.scanFill.style.width = `${progress}%`;
      }, 120);

      await Util.sleep(60);
      if (!current()) return;
      State.dupGroups = PlaylistProcessor.detectDuplicates(tracks);
      clearInterval(interval);
      if (el.scanFill)  el.scanFill.style.width  = '100%';
      if (el.scanLabel) el.scanLabel.textContent = 'COMPLETE';
      await Util.sleep(300);
      if (!current()) return;
      if (el.dupScanning) el.dupScanning.style.display = 'none';
      this._renderDupResults();
    } catch (err) {
      if (current()) this._closeDupModal();
      console.error('[YTM-Enhancer] Duplicate scan failed:', err);
    } finally {
      clearInterval(interval);
    }
  },

  _renderDupResults() {
    const { el } = UIManager;
    if (!el.dupBody) return;
    el.dupBody.innerHTML = '';
    State.selectedDups.clear();

    const skipped = State.dupSkippedDuration;
    const coverage = skipped ? ` — ${skipped} track${skipped > 1 ? 's' : ''} excluded: unknown duration` : '';
    const emptyText = el.dupEmpty?.querySelector('.empty-text');
    if (emptyText) emptyText.textContent = skipped
      ? 'No duplicates found among tracks with known durations.'
      : "Dupi-dupi can't find anything! You're all clear.";

    if (!State.dupGroups.length) {
      el.dupEmpty?.classList.add('visible');
      if (el.dupSubtitle) el.dupSubtitle.textContent = `NO DUPLICATES FOUND${coverage}`;
      return;
    }

    if (el.dupSubtitle)   el.dupSubtitle.textContent   = `Dupi-dupi found ${State.dupGroups.length} duplicate group${State.dupGroups.length > 1 ? 's' : ''}!${coverage}`;
    if (el.dupCountBadge) el.dupCountBadge.textContent = `${State.dupGroups.length} group${State.dupGroups.length > 1 ? 's' : ''}`;
    el.dupToolbar?.classList.add('visible');
    el.dupFooter?.classList.add('visible');

    State.dupGroups.forEach((group, gIdx) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'dup-group';
      groupEl.style.animationDelay = `${gIdx * 0.04}s`;
      const label = group.matchType === 'exact' ? 'Exact Match' : group.matchType === 'fuzzy' ? 'Fuzzy Match' : 'Version Variant';
      const cls   = group.matchType === 'exact' ? 'match-exact' : group.matchType === 'fuzzy' ? 'match-fuzzy' : 'match-remix';
      groupEl.innerHTML = `<div class="dup-group-header"><span class="group-label">Group ${gIdx+1}</span><span class="group-count">${group.tracks.length} copies</span><span class="group-match-type ${cls}">${label}</span></div>`;
      group.tracks.forEach((track, tIdx) => groupEl.appendChild(this._buildDupRow(track, tIdx === 0)));
      el.dupBody.appendChild(groupEl);
    });

    this._updateDupUI();
  },

  _buildDupRow(track, isFirst) {
    const row = document.createElement('div');
    row.className = `dup-track-row${isFirst ? ' keep-row' : ''}`;
    row.dataset.trackIdx = track.idx;

    const cb = document.createElement('input');
    cb.type      = 'checkbox';
    cb.className = `track-checkbox${isFirst ? ' keep-checkbox' : ''}`;
    if (!isFirst) { cb.checked = true; State.selectedDups.add(track.idx); row.classList.add('selected'); }

    cb.addEventListener('change', () => {
      if (cb.disabled) return;
      const tagEl = row.querySelector('[data-tag]');
      if (cb.checked) {
        State.selectedDups.add(track.idx);
        row.classList.add('selected'); row.classList.remove('keep-row');
        if (tagEl) { tagEl.className = 'track-tag tag-delete'; tagEl.textContent = 'DELETE'; }
      } else {
        State.selectedDups.delete(track.idx);
        row.classList.remove('selected');
        if (isFirst) row.classList.add('keep-row');
        if (tagEl) { tagEl.className = 'track-tag tag-keep'; tagEl.textContent = 'KEEP'; }
      }
      this._updateDupUI();
    });

    row.addEventListener('click', e => { if (e.target === cb || cb.disabled) return; cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); });

    const thumb = document.createElement('div');
    thumb.className = 'track-thumb';
    if (track.thumb?.startsWith('http')) {
      const img = document.createElement('img');
      img.src = track.thumb;
      img.style.cssText = 'width:36px;height:36px;object-fit:cover;display:block;';
      img.onerror = () => { thumb.removeChild(img); thumb.textContent = '♪'; };
      thumb.appendChild(img);
    } else { thumb.textContent = '♪'; }

    const info = document.createElement('div');
    info.className = 'track-info';
    info.innerHTML = `<div class="track-title">${track.rawTitle||'—'}</div><div class="track-meta">${track.rawArtist||''}${track.rawArtist&&track.duration?' · ':''}${track.duration||''}</div>`;

    const tag = document.createElement('span');
    if (isFirst) { tag.className = 'track-tag tag-first'; tag.textContent = 'FIRST'; }
    else         { tag.className = 'track-tag tag-delete'; tag.textContent = 'DELETE'; tag.dataset.tag = '1'; }

    row.appendChild(cb); row.appendChild(thumb); row.appendChild(info); row.appendChild(tag);
    return row;
  },

  _updateDupUI() {
    const { el } = UIManager;
    const count = State.selectedDups.size;
    const busy = Boolean(this._deleteOperation && !this._deleteOperation.cancelled);
    if (el.selCount)    el.selCount.textContent    = count ? `${count} track${count>1?'s':''} selected` : '';
    if (el.btnRemoveSel) el.btnRemoveSel.disabled  = busy || count === 0;
    if (el.btnConfirmDel) {
      el.btnConfirmDel.disabled    = busy || count === 0;
      el.btnConfirmDel.textContent = busy ? 'Deleting…' : count ? `🗑 Delete ${count} Track${count>1?'s':''}` : '🗑 Delete Selected';
    }
    [el.btnRescan, el.btnSelectAll, el.btnAutoKeep].forEach(button => { if (button) button.disabled = busy; });
    el.dupBody?.querySelectorAll('.track-checkbox').forEach(cb => {
      cb.disabled = busy || cb.closest('.dup-track-row')?.dataset.removed === 'true';
    });
    if (el.footerInfo) el.footerInfo.textContent = count
      ? `${count} of ${State.dupGroups.reduce((a,g) => a+g.tracks.length, 0)} duplicates marked`
      : '';
  },

  _selectAllDups() {
    shadow.querySelectorAll('.dup-track-row:not(.keep-row) .track-checkbox').forEach(cb => {
      if (!cb.disabled && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    });
  },

  _autoKeepFirst() {
    const body = UIManager.el.dupBody;
    State.dupGroups.forEach(group => {
      group.tracks.forEach((track, tIdx) => {
        const row = body?.querySelector(`[data-track-idx="${track.idx}"]`);
        const cb  = row?.querySelector('.track-checkbox');
        if (!cb || cb.disabled) return;
        const should = tIdx !== 0;
        if (cb.checked !== should) { cb.checked = should; cb.dispatchEvent(new Event('change')); }
      });
    });
  },

  async _confirmDelete() {
    if (!State.selectedDups.size || (this._deleteOperation && !this._deleteOperation.cancelled)) return;
    const count = State.selectedDups.size;
    if (!confirm(`Delete ${count} track${count>1?'s':''} from this playlist? This cannot be undone.`)) return;

    const { el } = UIManager;
    const operation = {
      epoch: this._dupEpoch,
      url: window.location.href,
      contents: window.__ytmeDom.getPlaylistContents(document),
      cancelled: false,
    };
    this._deleteOperation = operation;
    this._updateDupUI();

    // descending order so removing doesnt mess up indices
    const toRemove = State.dupGroups.flatMap(g => g.tracks)
      .filter(t => State.selectedDups.has(t.idx))
      .sort((a, b) => b.idx - a.idx);

    let removed = 0;
    try {
      for (const track of toRemove) {
        const result = await this._removeTrack(track, operation);
        // A closed/replaced modal must never receive an old operation's result.
        if (operation.cancelled || operation.epoch !== this._dupEpoch || el !== UIManager.el) return;
        if (result.status !== 'removed') {
          if (el.dupSubtitle) el.dupSubtitle.textContent =
            `STOPPED — ${removed}/${count} removals confirmed in page. ${result.reason} Remaining selections kept.`;
          return;
        }
        State.selectedDups.delete(track.idx);
        const row = el.dupBody?.querySelector(`[data-track-idx="${track.idx}"]`);
        if (row) {
          row.style.opacity = '0.3';
          row.dataset.removed = 'true';
          row.classList.remove('selected');
          const cb = row.querySelector('.track-checkbox');
          if (cb) { cb.checked = false; cb.disabled = true; }
          const tag = row.querySelector('.track-tag');
          if (tag) tag.textContent = 'REMOVED';
        }
        removed++;
        if (el.dupSubtitle) el.dupSubtitle.textContent = `${removed}/${count} removals confirmed in page`;
      }
    } catch (err) {
      if (!operation.cancelled && operation.epoch === this._dupEpoch && el === UIManager.el) {
        if (el.dupSubtitle) el.dupSubtitle.textContent =
          `STOPPED — ${removed}/${count} removals confirmed in page. Unexpected error; remaining selections kept.`;
      }
      console.error('[YTM-Enhancer] Delete operation failed:', err);
    } finally {
      if (this._deleteOperation === operation) this._deleteOperation = null;
      if (!operation.cancelled && operation.epoch === this._dupEpoch && el === UIManager.el) this._updateDupUI();
    }
  },

  _isDeleteCurrent(operation) {
    return this._deleteOperation === operation && !operation.cancelled &&
      operation.epoch === this._dupEpoch && operation.url === window.location.href &&
      operation.contents?.isConnected &&
      window.__ytmeDom.getPlaylistContents(document) === operation.contents;
  },

  async _removeTrack(track, operation) {
    const element = track.element;
    let clicked = false;
    const stale = () => ({ status: 'unverified', reason: 'Playlist changed or operation cancelled; rescan before retrying.' });
    const validRow = () => {
      if (!this._isDeleteCurrent(operation) || !element?.isConnected ||
          !operation.contents.contains(element)) return false;
      const current = window.__ytmeDom.getTrackData(element);
      return current.rawTitle === track.rawTitle && current.rawArtist === track.rawArtist &&
        current.duration === track.duration;
    };
    try {
      if (!validRow()) return stale();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await Util.sleep(400);
      if (!validRow()) return stale();
      element.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      element.dispatchEvent(new PointerEvent('pointerover',  { bubbles: true }));
      element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
      await Util.sleep(300);
      if (!validRow()) return stale();
      // Refuse a pre-existing visible menu rather than risk acting on another row.
      if (window.__ytmeDom.getRemoveMenuItem(document)) {
        return { status: 'failed', reason: 'Close the open track menu before retrying.' };
      }
      const menuBtn = window.__ytmeDom.getActionMenuButton(element);
      if (!menuBtn) return { status: 'failed', reason: 'Track menu not found.' };
      menuBtn.click();
      await Util.sleep(600);
      if (!validRow()) return stale();
      const removeItem = window.__ytmeDom.getRemoveMenuItem(document);
      if (!removeItem) return { status: 'failed', reason: 'Visible remove option not found.' };
      clicked = true;
      removeItem.click();
      const deadline = Date.now() + 5000;
      while (true) {
        if (!this._isDeleteCurrent(operation)) return stale();
        if (!operation.contents.contains(element)) {
          return element.isConnected
            ? { status: 'unverified', reason: 'Track moved to another container; rescan before retrying.' }
            : { status: 'removed', reason: 'Target row removal confirmed in page.' };
        }
        if (!validRow()) return stale();
        const remaining = deadline - Date.now();
        if (remaining <= 0) return { status: 'unverified', reason: 'Removal not confirmed within 5 seconds; check the playlist before retrying.' };
        await Util.sleep(Math.min(100, remaining));
      }
    } catch (err) {
      console.error('[YTM-Enhancer] Failed to remove track:', err);
      return { status: clicked ? 'unverified' : 'failed', reason: 'Track action failed; check the playlist before retrying.' };
    }
  },
};

const MessageBridge = {
  // wire up message handlers for popup <-> content
  register() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        switch (msg.type) {
          case 'SETTINGS_UPDATED':
            location.reload();
            return;

          case 'GET_TRACKS': {
            const tracks = PlaylistProcessor.extractTracks();
            const stats   = window.__ytmeTagger?.getStats(State.allTracks.length ? State.allTracks : tracks)
                          ?? { genreCounts: {}, untagged: tracks.length, total: tracks.length };
            sendResponse({
              tracks,
              playlistTitle: window.__ytmeDom.getPlaylistTitle(document),
              stats,
            });
            return;
          }

          case 'APPLY_FILTERS':
            State.activeGenres = msg.genres || [];
            sendResponse(InteractionHandler.applyFilters());
            return;

          case 'GET_STATS':
            sendResponse({ stats: window.__ytmeTagger?.getStats(State.allTracks) ?? null });
            return;

          case 'NAVIGATED':
            console.log('[YTM-Enhancer] NAVIGATED message received', msg.url);
            Enhancer.softReset(msg.url);
            sendResponse({ success: true });
            return;

          case 'THEME': {
            applyThemeToHost(msg.themeId);
            const theme = YTME_THEMES[msg.themeId] || YTME_THEMES['default'];
            document.documentElement.style.setProperty('--ytme-bg', theme.bg);
            document.documentElement.style.setProperty('--ytme-accent', theme.accent);
            document.documentElement.style.setProperty('--ytme-text', theme.text);
            document.documentElement.style.setProperty('--ytme-border', `color-mix(in srgb, ${theme.text} 15%, transparent)`);
            sendResponse({ success: true });
            return;
          }
        }
      } catch (err) {
        console.error('[YTM-Enhancer] Message handler error:', err);
        sendResponse({ error: err.message });
      }
    });
  },
};

function applyTags(trackElement) {
  if (!trackElement || trackElement.nodeType !== 1) return; 
  
  const existingBadge = trackElement.querySelector('.ytme-genre-badge');
  const existingBtn = trackElement.querySelector('button[title="Tag this track"]');
  const wasTagged = trackElement.dataset.ytmeTagged === '1';

  if (wasTagged && (!existingBadge || !existingBtn)) {
    delete trackElement.dataset.ytmeTagged; 
  }
  
  const tracks = PlaylistProcessor.extractTracks();
  const track = tracks.find(t => t.element === trackElement);
  if (!track) return;
  
  if (trackElement.dataset.ytmeTagged === '1' && existingBadge && existingBtn) {
    if (existingBadge) UIManager._updateGenreBadge(existingBadge, track);
    return;
  }

  UIManager.injectTrackUI(track);

  const badge = trackElement.querySelector('.ytme-genre-badge');
  if (badge) UIManager._updateGenreBadge(badge, track);
}

const DOMObserver = {
  _mutationObs:    null,
  _deltaObs:       null,
  _deltaInterval:  null,
  _deltaBusy:      false,
  _dragDropObs:    null,
  _dragDropRoot:   null,

  // watch for SPA navigation
  watchNavigation() {
    if (this._mutationObs) this._mutationObs.disconnect();
    if (!document.body) return; // Guard against null body

    let debounceTimeout;
    this._mutationObs = new MutationObserver(() => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        const href = window.location.href;
        const isPlaylist = href.includes('music.youtube.com/playlist') ||
                           href.includes('music.youtube.com/browse/VL');
        if (isPlaylist) {
          const playlistContents = window.__ytmeDom.getPlaylistContents(document);
          const urlChanged = href !== Enhancer._lastNavigationUrl;
          const playlistRootChanged = playlistContents && playlistContents !== this._dragDropRoot;
          if (urlChanged || playlistRootChanged) {
            Enhancer.softReset(href, playlistRootChanged);
            return;
          }
          Enhancer.injectUI();
        } else {
          // not a playlist, remove UI
          if (document.body && document.body.contains(host)) {
            host.remove();
          }
          this._stopDelta();
          InteractionHandler.releaseGlobalBindings();
          Enhancer._injected = false;
        }
      }, 250);
    });
    this._mutationObs.observe(document.body, { childList: true, subtree: true });
  },

  _stopNavigation() {
    this._mutationObs?.disconnect();
    this._mutationObs = null;
    this._stopDragDropObserver();
  },

  // watch for new tracks after initial load (lazy loading)
  startDelta(autoloadEnabled) {
    const root = document.querySelector(Config.selectors.playlistShelf) || document.body;

    if (this._deltaObs) this._deltaObs.disconnect();
    this._deltaObs = new MutationObserver(() => {
      console.log(`[YTM-Enhancer] DOM delta: ${PlaylistProcessor.getCurrentCount()} tracks`);
    });
    this._deltaObs.observe(root, { childList: true, subtree: true });

    if (this._deltaInterval) clearInterval(this._deltaInterval);
    this._deltaInterval = setInterval(async () => {
      const expected = PlaylistProcessor.getExpectedCount();
      const current  = PlaylistProcessor.getCurrentCount();
      if (!autoloadEnabled || expected === null || current >= expected ||
          PlaylistProcessor._autoloadBlockedAt === current || this._deltaBusy) return;

      this._deltaBusy = true;
      try {
        const result = await PlaylistProcessor.loadAll(autoloadEnabled);
        if (result.count <= current) return;
        State.allTracks = PlaylistProcessor.extractTracks();
        UIManager.injectAllTrackUI(); // inject buttons on the fresh tracks
        UIManager.refreshAllBadges();
      } finally {
        this._deltaBusy = false;
      }
    }, 5000);
  },

  _stopDelta() {
    this._deltaObs?.disconnect();
    if (this._deltaInterval) clearInterval(this._deltaInterval);
    this._deltaInterval = null;
    this._deltaBusy = false;
  },

  // Drag-and-drop observer: captures childList changes when songs are moved
  startDragDropObserver() {
    if (this._dragDropObs) this._dragDropObs.disconnect();
    
    this._dragDropObs = new MutationObserver((mutations) => {
      const nodesToProcess = new Set();

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            if (window.__ytmeDom.isTrackRow(node)) {
              nodesToProcess.add(node);
            } else {
              window.__ytmeDom.getDescendantTrackRows(node)
                  .forEach(n => nodesToProcess.add(n));
            }
          });
        }
      }
    
      if (!nodesToProcess.size) return;
      requestAnimationFrame(() => {
        setTimeout(() => {
          nodesToProcess.forEach(applyTags);
          UIManager.refreshAllBadges();
        }, 80);
      });
    });

    const playlistContainer = window.__ytmeDom.getPlaylistContents(document);
    if (!playlistContainer) return;
    this._dragDropRoot = playlistContainer;
    this._dragDropObs.observe(playlistContainer, { childList: true, subtree: true });
  },

  _stopDragDropObserver() {
    this._dragDropObs?.disconnect();
    this._dragDropObs = null;
  },
};

const Enhancer = {
  _injected: false,
  _lastNavigationUrl: window.location.href,

  init() {
    MessageBridge.register();

    // Try once immediately. The navigation observer retries when YTM adds the
    // search box, without leaving a permanent 100ms poll on non-playlist pages.
    this.injectUI();
    
    // keep watching for SPA nav
    DOMObserver.watchNavigation();
  },

  /** Soft reset when SPA navigation detected by background script */
  async softReset(nextUrl = window.location.href, force = false) {
    if (!force && nextUrl === this._lastNavigationUrl) return false;
    this._lastNavigationUrl = nextUrl;

    InteractionHandler._closeDupModal();

    State.allTracks = [];
    State.dupGroups = [];
    PlaylistProcessor._autoloadBlockedAt = null;
    DOMObserver._stopDelta();
    DOMObserver._stopDragDropObserver();
    InteractionHandler.releaseGlobalBindings();
    // console.log('softReset called from:', window.location.href);

    // wipe stale tags so last playlist's data doesnt bleed in
    window.__ytmeTagger?._clearStore?.();

    if (document.body && document.body.contains(host)) host.remove();
    this._injected = false;

    // only re-inject if we're on a playlist
    const href = window.location.href;
    const isPlaylist = href.includes('music.youtube.com/playlist') ||
                       href.includes('music.youtube.com/browse/VL');
    if (!isPlaylist) return true;

    const waitForSearch = () => new Promise(resolve => {
      const interval = setInterval(() => {
        const searchBox = document.querySelector(Config.selectors.searchBox);
        if (searchBox) {
          clearInterval(interval);
          resolve(searchBox);
        }
      }, 100);
    });

    await waitForSearch();
    await this.injectUI();
    return true;
  },

  async injectUI() {
    // bail if not a playlist
    const href = window.location.href;
    const isPlaylist = href.includes('music.youtube.com/playlist') ||
                       href.includes('music.youtube.com/browse/VL');
    if (!isPlaylist) return;

    const { searchEnabled, duplicatesEnabled, autoloadEnabled } = window.__ytme;
    const searchBox = document.querySelector(Config.selectors.searchBox);
    if (!searchBox || document.body.contains(host)) return;

    // Reserve the current shelf before autoload starts mutating it. Without
    // this, those normal row additions look like a playlist-root replacement
    // and the SPA guard repeatedly tears down/rebuilds Dupi while scrolling.
    DOMObserver._dragDropRoot = window.__ytmeDom.getPlaylistContents(document);

    try {
      document.getElementById('tag-picker')?.remove();
      document.getElementById('ytme-tag-picker-styles')?.remove();

      UIManager.build(searchEnabled, duplicatesEnabled);
      InteractionHandler.bindAll();
      searchBox.parentNode.insertBefore(host, searchBox.nextSibling);
    } catch (err) {
      console.error('[YTM-Enhancer] Failed to inject UI:', err);
      return;
    }

    return new Promise(resolve => {
      setTimeout(async () => {
        try {
          if (window.__ytmeTagger) {
            State.allTracks = PlaylistProcessor.extractTracks();
            if (State.allTracks.length) {
              const playlistId = new URLSearchParams(window.location.search).get('list');
              await window.__ytmeTagger._fastInit(State.allTracks, playlistId);
              UIManager.injectAllTrackUI();
            }
          }

          // Observe the shelf before autoload appends its next batch so tag
          // controls are attached per-row instead of appearing in one late
          // flash after the whole playlist finishes loading.
          DOMObserver.startDragDropObserver();
          await PlaylistProcessor.loadAll(autoloadEnabled);
          DOMObserver.startDelta(autoloadEnabled);

          if (window.__ytmeTagger) {
            State.allTracks = PlaylistProcessor.extractTracks();
            await window.__ytmeTagger.run(State.allTracks);
            UIManager.injectAllTrackUI();
          }
        } catch (err) {
          if (String(err?.message || err).includes('Extension context invalidated')) {
            DOMObserver._stopDelta();
            DOMObserver._stopDragDropObserver();
            InteractionHandler.releaseGlobalBindings();
            resolve();
            return;
          }
          console.error('[YTM-Enhancer] Post-inject setup failed:', err);
        }
        resolve();
      }, 1000);
    });
  },
};
}
