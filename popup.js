/* constants */
const GENRES = ['Rock', 'Pop', 'Electronic', 'R&B', 'Metal', 'Classical', 'Jazz', 'Hip-Hop', 'Nightcore', 'Cover', 'Untagged', "Indie"];

const DEFAULT_SETTINGS = {
  activeGenres:     [],
  toggleSearch:     true,
  toggleDuplicates: true,
  toggleAutoload:   true,
  toggleGenreFetch: true,
  toggleMoodRules:  true,
};

/* element refs */
const statusDot        = document.getElementById('status-dot');
const statusLabel      = document.getElementById('status-label');
const loadingState     = document.getElementById('loading-state');
const notPlaylist      = document.getElementById('not-playlist');
const notPlaylistText  = document.getElementById('not-playlist-text');
const mainContent      = document.getElementById('main-content');
const playlistBanner   = document.getElementById('playlist-banner');
const playlistName     = document.getElementById('playlist-name');
const playlistMeta     = document.getElementById('playlist-meta');
const toast            = document.getElementById('toast');
const btnRefresh       = document.getElementById('btn-refresh');
const btnReview        = document.getElementById('btn-review');
const btnSettings      = document.getElementById('btn-settings');
const btnBack          = document.getElementById('btn-back');
const btnClearCache    = document.getElementById('btn-clear-cache');
const genrePillsEl     = document.getElementById('genre-pills');
const cacheArtistsEl   = document.getElementById('cache-artists');
const cacheGenresEl    = document.getElementById('cache-genres');
const cacheSizeEl      = document.getElementById('cache-size');

const btnJSON = document.getElementById('export-json');
const btnCSV  = document.getElementById('export-csv');
const btnMD   = document.getElementById('export-md');

/* state */
let cachedTracks        = [];
let cachedPlaylistTitle = 'playlist';
let settings            = { ...DEFAULT_SETTINGS };

function showPage(pageId, isBack = false) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active', 'back-anim'));
  const page = document.getElementById(pageId);
  if (isBack) page.classList.add('back-anim');
  page.classList.add('active');
}

btnSettings.addEventListener('click', () => {
  updateCacheStats();
  showPage('page-settings');
});

btnBack.addEventListener('click', () => {
  showPage('page-main', true);
});

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('ytme_settings', (data) => {
      if (data.ytme_settings) {
        settings = { ...DEFAULT_SETTINGS, ...data.ytme_settings };
      }
      resolve();
    });
  });
}

function saveSettings() {
  chrome.storage.local.set({ ytme_settings: settings });
}

function renderGenrePills(stats) {
  genrePillsEl.innerHTML = '';
  GENRES.forEach(genre => {
    const isUntagged = genre === 'Untagged';
    const count = isUntagged
      ? (stats?.untagged || 0)
      : (stats?.genreCounts?.[genre] || 0);

    // skip genres with 0 count except Untagged, that always shows
    if (!isUntagged && !count && stats) return;

    const pill = document.createElement('button');
    const isActive = settings.activeGenres.includes(genre);
    pill.className = 'filter-pill' + (isActive ? (isUntagged ? ' active-warn' : ' active-genre') : '');

    // untagged gets amber to stand out
    if (isUntagged) {
      pill.style.cssText = isActive
        ? 'background:rgba(245,158,11,0.15);border-color:rgba(245,158,11,0.4);color:#fbbf24;'
        : 'color:#666;border-color:#2a2a2a;';
    }

    pill.innerHTML = `${genre}${count ? ` <span style="opacity:0.6;font-size:9px">(${count})</span>` : ''}`;
    pill.addEventListener('click', () => {
      if (settings.activeGenres.includes(genre)) {
        settings.activeGenres = settings.activeGenres.filter(g => g !== genre);
        pill.classList.remove('active-genre', 'active-warn');
        pill.style.cssText = isUntagged ? 'color:#666;border-color:#2a2a2a;' : '';
      } else {
        settings.activeGenres.push(genre);
        pill.classList.add(isUntagged ? 'active-warn' : 'active-genre');
        if (isUntagged) pill.style.cssText = 'background:rgba(245,158,11,0.15);border-color:rgba(245,158,11,0.4);color:#fbbf24;';
      }
      saveSettings();
      sendFilterMessage();
    });
    genrePillsEl.appendChild(pill);
  });
}

function sendFilterMessage() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, {
      type:   'APPLY_FILTERS',
      genres: settings.activeGenres,
    }, (response) => {
      chrome.runtime.lastError;
      if (response) {
        showToast(
          settings.activeGenres.length
            ? `${response.visible} tracks visible`
            : 'Filters cleared',
          'info'
        );
      }
    });
  });
}

function bindToggle(id, settingKey, onChangeCallback) {
  const el = document.getElementById(id);
  if (!el) return;

  el.checked = settings[settingKey];

  el.addEventListener('change', () => {
    settings[settingKey] = el.checked;
    saveSettings();
    notifyContentScript({ type: 'SETTINGS_UPDATED', settings });
    showToast(el.checked ? 'Enabled' : 'Disabled', 'info');
    if (onChangeCallback) onChangeCallback(el.checked);
  });
}

function reloadContentScript() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['fuse.basic.min.js', 'tagger.js', 'content.js']
    }, () => {
      chrome.runtime.lastError;
    });
  });
}

function bindAllToggles() {
  bindToggle('toggle-search',      'toggleSearch',     () => reloadContentScript());
  bindToggle('toggle-duplicates',  'toggleDuplicates', () => reloadContentScript());
  bindToggle('toggle-autoload',    'toggleAutoload');
  bindToggle('toggle-genre-fetch', 'toggleGenreFetch', () => reloadContentScript());
  bindToggle('toggle-mood-rules',  'toggleMoodRules');
}

async function updateCacheStats() {
  chrome.storage.local.get(null, (allData) => {
    const genreCache = allData.ytme_genre_cache || {};
    const artistCount = Object.keys(genreCache).length;
    const genreCount = Object.values(genreCache)
      .reduce((acc, genres) => acc + (Array.isArray(genres) ? genres.length : 0), 0);

    // rough size estimate, good enough
    const rawSize = JSON.stringify(genreCache).length;
    const sizeStr = rawSize > 1024
      ? `${(rawSize / 1024).toFixed(1)} KB`
      : `${rawSize} B`;

    cacheArtistsEl.textContent = artistCount;
    cacheGenresEl.textContent  = genreCount;
    cacheSizeEl.textContent    = sizeStr;
  });
}

btnClearCache.addEventListener('click', () => {
  chrome.storage.local.get(null, (allData) => {
    const keysToRemove = Object.keys(allData).filter(k =>
      k === 'ytme_genre_cache' || k.startsWith('ytme_snapshot_')
    );
    chrome.storage.local.remove(keysToRemove, () => {
      updateCacheStats();
      showToast('Genre cache cleared', 'success');
    });
  });
});

async function fetchTracks(tabId, attempt = 1) {
  chrome.tabs.sendMessage(tabId, { type: 'GET_TRACKS' }, (response) => {
    if (chrome.runtime.lastError) {
      const err = chrome.runtime.lastError.message || '';
      if (attempt < 3 && err.includes('message port closed')) {
        // transient race, retry before fallback
        // console.log('retrying fetchTracks, attempt:', attempt);
        setTimeout(() => fetchTracks(tabId, attempt + 1), 350);
        return;
      }

      // Content script isn't ready yet, inject it
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['fuse.basic.min.js', 'tagger.js', 'content.js'] },
        () => {
          if (chrome.runtime.lastError) {
            showError('Failed to inject script: ' + chrome.runtime.lastError.message);
            return;
          }
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { type: 'GET_TRACKS' }, (response) => {
              if (chrome.runtime.lastError || !response) {
                showError('Could not load tracks. Try refreshing the page.');
                return;
              }
              handleTracksResponse(response);
            });
          }, 1500);
        }
      );
      return;
    }

    if (!response || !response.tracks) {
      showError('No tracks received.');
      return;
    }

    handleTracksResponse(response);
  });
}

function handleTracksResponse(response) {
  cachedTracks        = response.tracks;
  cachedPlaylistTitle = response.playlistTitle || 'playlist';
  showMain(response.stats || null);
}

function notifyContentScript(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) chrome.tabs.sendMessage(tab.id, message, () => {
      // might not be listening, thats fine
      chrome.runtime.lastError;
    });
  });
}

function showLoading() {
  loadingState.classList.add('visible');
  notPlaylist.classList.remove('visible');
  mainContent.classList.remove('visible');
  playlistBanner.classList.remove('visible');
}

function showNotPlaylist() {
  loadingState.classList.remove('visible');
  notPlaylist.classList.add('visible');
  mainContent.classList.remove('visible');
  setStatus('inactive', 'INACTIVE');
}

function showMain(stats) {
  loadingState.classList.remove('visible');
  notPlaylist.classList.remove('visible');
  mainContent.classList.add('visible');
  playlistBanner.classList.add('visible');
  playlistName.textContent = cachedPlaylistTitle;
  playlistMeta.textContent = `${cachedTracks.length} track${cachedTracks.length !== 1 ? 's' : ''} loaded`;
  renderGenrePills(stats);
}

function showError(msg) {
  loadingState.classList.remove('visible');
  notPlaylist.classList.add('visible');
  notPlaylistText.textContent = msg;
  setStatus('inactive', 'ERROR');
}

function setStatus(state, label) {
  if (statusDot) statusDot.className    = `status-dot ${state}`;
  if (statusLabel) statusLabel.textContent = label;
}

let toastTimer;

function showToast(message, type = 'success') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className   = `visible ${type}`;
  toastTimer = setTimeout(() => { toast.className = ''; }, 2500);
}

function safeFilename(name) {
  return name.replace(/[^\w\s\-]/g, '').replace(/\s+/g, '_').slice(0, 60);
}

function datestamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    URL.revokeObjectURL(url);
    if (chrome.runtime.lastError) {
      showToast('Download failed.', 'error');
    } else {
      showToast(`Saved: ${filename}`, 'success');
    }
  });
}

function exportJSON() {
  if (!cachedTracks.length) { showToast('No tracks to export.', 'error'); return; }
  const data = {
    exportedAt:    new Date().toISOString(),
    playlistTitle: cachedPlaylistTitle,
    trackCount:    cachedTracks.length,
    tracks: cachedTracks.map((t, i) => ({
      index:    i + 1,
      title:    t.rawTitle,
      artist:   t.rawArtist,
      duration: t.duration,
      album:    t.album || ''
    }))
  };
  downloadFile(JSON.stringify(data, null, 2), `${safeFilename(cachedPlaylistTitle)}_${datestamp()}.json`, 'application/json');
}

function exportCSV() {
  if (!cachedTracks.length) { showToast('No tracks to export.', 'error'); return; }
  const headers = ['#', 'Title', 'Artist', 'Duration', 'Album'];
  const rows    = cachedTracks.map((t, i) => [
    i + 1,
    csvCell(t.rawTitle),
    csvCell(t.rawArtist),
    csvCell(t.duration),
    csvCell(t.album || '')
  ]);
  const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile(content, `${safeFilename(cachedPlaylistTitle)}_${datestamp()}.csv`, 'text/csv');
}

function csvCell(value) {
  const str = String(value || '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportMarkdown() {
  if (!cachedTracks.length) { showToast('No tracks to export.', 'error'); return; }
  const lines = [
    `# ${cachedPlaylistTitle}`,
    ``,
    `> Exported ${new Date().toLocaleDateString()} — ${cachedTracks.length} tracks`,
    ``
  ];
  cachedTracks.forEach((t, i) => {
    const artist   = t.rawArtist ? ` — ${t.rawArtist}` : '';
    const duration = t.duration  ? ` \`${t.duration}\`` : '';
    lines.push(`${i + 1}. **${t.rawTitle}**${artist}${duration}`);
  });
  downloadFile(lines.join('\n'), `${safeFilename(cachedPlaylistTitle)}_${datestamp()}.md`, 'text/markdown');
}

btnJSON.addEventListener('click', exportJSON);
btnCSV.addEventListener('click',  exportCSV);
btnMD.addEventListener('click',   exportMarkdown);

btnRefresh.addEventListener('click', () => {
  cachedTracks = [];
  init();
});

btnReview.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://chrome.google.com/webstore/detail/yt-music-playlist-enhance/aigenoggiahlkplokpmlhojfndombagg/reviews' });
});



// live update when tagger finishes enriching
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TAGS_UPDATED' && msg.stats && mainContent.classList.contains('visible')) {
    renderGenrePills(msg.stats);
  }
});

const THEMES = [
  { id: 'default',        label: 'Default',   bg: '#030407', accent: '#00f0ff', text: null },
  { id: 'twilight-patch', label: 'Twilight',   bg: '#16042a', accent: '#e1dd6a', text: null },
  { id: 'deep-ocean',     label: 'Deep Ocean', bg: '#0F172A', accent: '#F97316', text: null },
  { id: 'snowy',          label: 'Snowy',      bg: '#f5f5f5f9', accent: '#C85A00', text: '#1F2937' },
  { id: 'ice',            label: 'Ice',        bg: '#d9eef8', accent: '#6B21A8', text: '#1F2937' },
  { id: 'matcha',         label: 'Matcha',     bg: '#ebe5df', accent: '#15803D', text: '#1F2937' }, 
];

function applyTheme(themeId) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const root  = document.documentElement;
  root.style.setProperty('--bg-color',     theme.bg);
  root.style.setProperty('--accent-color', theme.accent);
  root.style.setProperty('--text-primary', theme.text || '#e0e0e0');

  const isLight = ['snowy', 'ice', 'matcha'].includes(themeId);
  document.body.classList.toggle('light-theme', isLight);

  document.querySelectorAll('.theme-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.themeId === theme.id);
  });
}

function saveTheme(themeId) {
  chrome.storage.local.set({ ytme_theme: themeId });
  notifyContentScript({ type: 'THEME', themeId });
}

function loadTheme() {
  chrome.storage.local.get('ytme_theme', (data) => {
    applyTheme(data.ytme_theme || 'default');
  });
}

function renderThemeGrid() {
  const grid = document.getElementById('theme-grid');
  if (!grid) return;
  grid.innerHTML = '';

  THEMES.forEach(theme => {
    const swatch = document.createElement('button');
    swatch.className       = 'theme-swatch';
    swatch.dataset.themeId = theme.id;
    swatch.title           = theme.label;

    swatch.innerHTML = `
      <div class="theme-preview">
        <div class="theme-preview-bg"     style="background:${theme.bg};"></div>
        <div class="theme-preview-accent" style="background:${theme.accent};"></div>
      </div>
      <span class="theme-label">${theme.label}</span>
    `;

    swatch.addEventListener('click', () => {
      applyTheme(theme.id);
      saveTheme(theme.id);
      showToast(`Theme: ${theme.label}`, 'info');
    });

    grid.appendChild(swatch);
  });
}

async function init() {
  showLoading();

  // load settings first
  await loadSettings();
  renderGenrePills(null);
  bindAllToggles();

  renderThemeGrid();
  loadTheme();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url) {
    showNotPlaylist();
    return;
  }

  const isPlaylistPage =
    tab.url.includes('music.youtube.com/playlist') ||
    tab.url.includes('music.youtube.com/browse/VL');

  if (!isPlaylistPage) {
    showNotPlaylist();
    return;
  }

  setStatus('active', 'ACTIVE');
  fetchTracks(tab.id);
}

init();