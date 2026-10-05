'use strict';

if (window.__ytmeTaggerLoaded) {
  console.log('[YTM-Tagger] already loaded, skipping re-init');
} else {
  window.__ytmeTaggerLoaded = true;
  window.__ytmeRunSessionId = window.__ytmeRunSessionId || 0;

const LASTFM_API_KEY   = '25a4b652df6dfc2407a1d93ed16da8bb';
const LASTFM_BASE_URL  = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_BATCH     = 10;
const LASTFM_DELAY_MS  = 100;
const LASTFM_MIN_COUNT = 3;

// add genres/artists here, patterns compile at runtime
const GENRE_DATABASE = {
  Nightcore: {
    titleKeywords:  ['nightcore', 'sped up', 'speed up', 'tiktok version'],
    artistKeywords: ['nightcore', 'syrex', 'cherry', 'sinon', 'flyx'],
  },
  Cover: {
    titleKeywords:  ['cover', 'tribute', 'カバー', 'vocal cover', 'guitar cover',
                     'piano cover', 'violin cover', 'english cover', 'rock cover',
                     'acoustic cover', 'orchestral cover', 'the first take'],
    artistKeywords: ['boyce avenue', 'pentatonix', 'j.fla', 'kobasolo', 'conor maynard', 
                     'alex goot', 'kurzgesagt', 'chloe moriondo', 'first to eleven', 'minachu'],
  },
  Classical: {
    titleKeywords:  ['beethoven','mozart','chopin','bach','vivaldi','brahms','paganini',
                     'schubert','tchaikovsky','verdi','handel','haydn','debussy','ravel',
                     'liszt','czardas','hungarian dance','symphony','concerto','sonata',
                     'opera','quartet','orchestra','overture','requiem','nocturne','etude',
                     'fugue','prelude','fur elise','four seasons', 'film score', 'ost'],
    artistKeywords: ['beethoven','mozart','chopin','bach','vivaldi','brahms','paganini',
                     'schubert','tchaikovsky','verdi','handel','haydn','debussy','ravel',
                     'liszt','itzhak perlman','ray chen','lindsey stirling', 'hans zimmer',
                     'john williams', 'ludovico einaudi', 'yo-yo ma', 'andrea bocelli',
                     'max richter', 'philip glass', 'yiruma', 'ennio morricone'],
  },
  Metal: {
    titleKeywords:  ['metal','metalcore','deathcore','thrash','doom','djent'],
    artistKeywords: ['skillet','evanescence','linkin park','slipknot','disturbed',
                     'rammstein','within temptation','nightwish','epica','kiss',
                     'him','meelz','satans elite kommando', 'metallica', 'iron maiden',
                     'black sabbath', 'megadeth', 'slayer', 'pantera', 'tool', 'gojira',
                     'avenged sevenfold', 'korn', 'deftones', 'system of a down', 'motorhead'],
  },
  Electronic: {
    titleKeywords:  ['edm','dubstep','techno','trance','hardstyle','synthwave',
                     'vaporwave','lofi','lo-fi', 'house', 'chillwave', 'drum and bass'],
    artistKeywords: ['daft punk','deadmau5','skrillex','tiesto','avicii',
                     'martin garrix','alan walker','baasik','icona pop',
                     'a touch of class','dance fruits music', 'calvin harris',
                     'david guetta', 'zedd', 'the chainsmokers', 'marshmello',
                     'dj snake', 'flume', 'illenium', 'porter robinson', 'rufus du sol',
                     'disclosure', 'odesza', 'kygo', 'swedish house mafia'],
  },
  'Hip-Hop': {
    titleKeywords:  ['rap','hip-hop','hip hop','trap','drill', 'type beat'],
    artistKeywords: ['kendrick','drake','eminem','kanye','jay-z','travis scott',
                     '21 savage','nicki minaj','cardi b','flo rida','bbno$',
                     'k\'naan','mori calliope', 'snoop dogg', 'j. cole', 'tyler the creator',
                     'asap rocky', 'future', 'playboi carti', 'doja cat', 'dr. dre', 
                     'tupac', 'notorious b.i.g.', '50 cent', 'mac miller', 'lil uzi vert', 
                     'xxxtentacion', 'juice wrld', 'megan thee stallion', 'wu-tang clan'],
  },
  Indie: {
    titleKeywords:  ['indie', 'alternative', 'bedroom pop'],
    artistKeywords: ['arctic monkeys','tame impala','the neighbourhood','the killers',
                     'cage the elephant','vampire weekend','modest mouse','beach house',
                     'bon iver','fleet foxes','the national','beirut','sufjan stevens',
                     'death cab for cutie','the shins','mgmt','real estate','diiv',
                     'mac demarco','men i trust','cigarettes after sex','still woozy',
                     'wallows','dominic fike','mitski','soccer mommy','snail mail',
                     'japanese breakfast','boygenius','phoebe bridgers','angel olsen',
                     'big thief','pinegrove','the war on drugs','father john misty',
                     'yuzyuzeyken konusuruz','son feci bisiklet','kolpa', 'glass animals',
                     'hozier', 'clairo', 'beabadoobee', 'the 1975', 'florence + the machine',
                     'alt-j', 'the xx', 'foster the people', 'two door cinema club', 'girl in red',
                     'dayglow', 'declan mckenna', 'cavetown'],
  },
  Rock: {
    titleKeywords:  ['rock','punk','grunge', 'classic rock', 'hard rock'],
    artistKeywords: ['nirvana','radiohead','foo fighters','green day','muse','coldplay',
                     'oasis','duman','kargo','manga','mor ve otesi','barış manço',
                     'yaşlı amca','maneskin','they might be giants','sting','woodkid',
                     'against the current','şebnem ferah','emre aydın','yüksek sadakat',
                     'model','can koç','umut kaya','cem karaca','lynyrd skynyrd',
                     'kate bush','bonnie tyler','k.flay', 'queen', 'the beatles',
                     'pink floyd', 'led zeppelin', 'the rolling stones', 'ac/dc', 
                     'guns n roses', 'aerosmith', 'red hot chili peppers', 'the strokes', 
                     'paramore', 'my chemical romance', 'fall out boy', 'panic! at the disco',
                     'the black keys', 'the white stripes', 'fleetwood mac', 'eagles'],
  },
  Pop: {
    titleKeywords:  ['k-pop','j-pop','kpop','jpop', 'pop', 'top 40', 'acoustic', 'radio edit'],
    artistKeywords: ['bts','blackpink','twice','taylor swift','ariana grande',
                     'billie eilish','olivia rodrigo','dua lipa','the weeknd',
                     'ed sheeran','justin bieber','selena gomez','mariah carey',
                     'lady gaga','adele','george michael','abba','modern talking',
                     'tarkan','oğuzhan koç','güliz ayla','simge','bengü','atiye',
                     'serdar ortaç','murat boz','mustafa sandal','nil karaibrahimgil',
                     'sertab erener','ozan doğulu','nükhet duru','gökhan türkmen',
                     'gökçe','işın karaca','aşkın nur yengi','funda','hakan peker',
                     'erol evgin','ace of base','army of lovers','sylvie vartan',
                     'laufey','lenka','pabllo vittar','kenshi yonezu','radwimps',
                     'caramella girls','nanahira','fifty fifty','rose','miki matsubara',
                     'anri', 'bruno mars', 'katy perry', 'rihanna', 'post malone',
                     'harry styles', 'miley cyrus', 'shawn mendes', 'maroon 5', 
                     'imagine dragons', 'charlie puth', 'sabrina carpenter', 
                     'chappell roan', 'sam smith', 'michael jackson', 'madonna', 
                     'elton john', 'tate mcrae', 'justin timberlake', 'kelly clarkson'],
  },
  Jazz: {
    titleKeywords:  ['jazz','blues','swing','bebop','soul','gospel', 'bossa nova'],
    artistKeywords: ['miles davis','coltrane','ella fitzgerald','billie holiday',
                     'nina simone','louis armstrong','amy winehouse','the ink spots',
                     'natori','or3o','ali', 'duke ellington', 'john coltrane',
                     'charles mingus', 'thelonious monk', 'dave brubeck', 'herbie hancock',
                     'nat king cole', 'frank sinatra', 'dean martin', 'michael buble',
                     'kamasi washington', 'louis prima', 'ray charles'],
  },
  'R&B': {
    titleKeywords:  ['r&b','rnb','neo-soul','neo soul', 'rhythm and blues'],
    artistKeywords: ['usher','beyonce','frank ocean','sza','jhene aiko',
                     'daniel caesar','h.e.r','sevdaliza','yseult','chris grey',
                     'the rah band', 'steve lacy', 'childish gambino', 'brent faiyaz',
                     'summer walker', 'khalid', 'boyz ii men', 'tlc', 'lauryn hill',
                     'erykah badu', 'd\'angelo', 'mary j. blige', 'alicia keys', 
                     'john legend', 'kehlani', 'bryson tiller', 'destinys child']
  },
};

// TODO: I could make a distinguish between core genre and subgenre with using LastFM's tag info i guess

const LASTFM_TAG_MAP = {
  // Rock
  'rock':'Rock','alternative rock':'Rock','punk rock':'Rock',
  'punk':'Rock','grunge':'Rock','hard rock':'Rock','soft rock':'Rock',
  'post-rock':'Rock','psychedelic rock':'Rock','progressive rock':'Rock',
  'garage rock':'Rock','new wave':'Rock','post-punk':'Rock','shoegaze':'Rock',
  'emo':'Rock','folk rock':'Rock','art rock':'Rock','noise rock':'Rock',
  'britpop':'Rock','math rock':'Rock',
  // Indie
  'indie rock':'Indie','indie pop':'Indie','alternative':'Indie','indie':'Indie',
  'dream pop':'Indie','chamber pop':'Indie','lo-fi indie':'Indie',
  'jangle pop':'Indie','sadcore':'Indie','twee pop':'Indie',
  // Metal
  'metal':'Metal','heavy metal':'Metal','death metal':'Metal','black metal':'Metal',
  'metalcore':'Metal','deathcore':'Metal','thrash metal':'Metal','doom metal':'Metal',
  'power metal':'Metal','progressive metal':'Metal','nu-metal':'Metal','nu metal':'Metal',
  'speed metal':'Metal','groove metal':'Metal','symphonic metal':'Metal',
  'folk metal':'Metal','industrial metal':'Metal','gothic metal':'Metal','djent':'Metal',
  // Pop
  'pop':'Pop','k-pop':'Pop','j-pop':'Pop','c-pop':'Pop','dance pop':'Pop',
  'electropop':'Pop','synth-pop':'Pop','teen pop':'Pop','bubblegum pop':'Pop',
  'pop rock':'Pop','art pop':'Pop','hyperpop':'Pop',
  'korean pop':'Pop','japanese pop':'Pop',
  // Electronic
  'electronic':'Electronic','electronica':'Electronic','edm':'Electronic',
  'techno':'Electronic','trance':'Electronic','house':'Electronic',
  'deep house':'Electronic','tech house':'Electronic','progressive house':'Electronic',
  'dubstep':'Electronic','drum and bass':'Electronic','dnb':'Electronic',
  'drum n bass':'Electronic','jungle':'Electronic','hardstyle':'Electronic',
  'ambient':'Electronic','downtempo':'Electronic','chillout':'Electronic',
  'idm':'Electronic','glitch':'Electronic','synthwave':'Electronic',
  'retrowave':'Electronic','vaporwave':'Electronic','chillwave':'Electronic',
  'future bass':'Electronic','electro':'Electronic','breaks':'Electronic',
  'breakbeat':'Electronic','uk garage':'Electronic','grime':'Electronic',
  'lo-fi':'Electronic','lofi':'Electronic','lo fi hip hop':'Electronic',
  // Hip-Hop
  'hip-hop':'Hip-Hop','hip hop':'Hip-Hop','rap':'Hip-Hop','trap':'Hip-Hop',
  'drill':'Hip-Hop','boom bap':'Hip-Hop','conscious hip hop':'Hip-Hop',
  'cloud rap':'Hip-Hop','emo rap':'Hip-Hop','crunk':'Hip-Hop',
  'gangsta rap':'Hip-Hop','southern hip hop':'Hip-Hop',
  'east coast hip hop':'Hip-Hop','west coast hip hop':'Hip-Hop','uk hip hop':'Hip-Hop',
  // R&B
  'r&b':'R&B','rnb':'R&B','rhythm and blues':'R&B','neo-soul':'R&B','neo soul':'R&B',
  'contemporary r&b':'R&B','quiet storm':'R&B','new jack swing':'R&B',
  'soul':'R&B','funk':'R&B','motown':'R&B',
  // Jazz
  'jazz':'Jazz','blues':'Jazz','swing':'Jazz','bebop':'Jazz','cool jazz':'Jazz',
  'free jazz':'Jazz','fusion':'Jazz','smooth jazz':'Jazz','jazz fusion':'Jazz',
  'acid jazz':'Jazz','nu jazz':'Jazz','gospel':'Jazz',
  // Classical
  'classical':'Classical','classical music':'Classical','orchestral':'Classical',
  'opera':'Classical','baroque':'Classical','romantic':'Classical',
  'contemporary classical':'Classical','chamber music':'Classical',
  'symphony':'Classical','piano':'Classical','violin':'Classical','cello':'Classical',
  'neoclassical':'Classical','post-classical':'Classical','modern classical':'Classical',
  'instrumental':'Classical','soundtrack':'Classical','film score':'Classical',
  // Nightcore
  'nightcore':'Nightcore','anime':'Nightcore','j-rock':'Nightcore',
  'visual kei':'Nightcore','anison':'Nightcore',
  // Cover
  'cover':'Cover','covers':'Cover','tribute':'Cover','vocal cover':'Cover',
  'anime cover':'Cover','game cover':'Cover','piano cover':'Cover',
  'guitar cover':'Cover','violin cover':'Cover','orchestra cover':'Cover',
};

const TagStore = (() => {
  /** @type {Map<string, {genres: string[], source: string}>} */
  let _map = new Map();
  const MANUAL_KEY = 'ytme_manual_tags_v2';
  const SNAPSHOT_PREFIX = 'ytme_snapshot_v2_';
  let _storageQueue = Promise.resolve();

  function _makeKey(track) {
    return `v2:${JSON.stringify([_norm(track.rawTitle), _norm(track.rawArtist)])}`;
  }
  function _norm(s) {
    return typeof s === 'string' ? s.normalize('NFC').trim() : '';
  }
  function _record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function _genres(value) {
    return Array.isArray(value) ? value.filter(genre => typeof genre === 'string') : [];
  }
  function _read(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, data => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(data || {});
      });
    });
  }
  function _write(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
  // Serialize migrations, picker writes and snapshots, including other YTM tabs
  // when Web Locks is available. Keep the local queue as a fallback.
  function _serialized(work) {
    const result = _storageQueue.then(() =>
      typeof navigator !== 'undefined' && navigator.locks?.request
        ? navigator.locks.request('dupi-tag-storage-v2', work)
        : work());
    _storageQueue = result.catch(() => {});
    return result;
  }

  return {
    clear() { _map = new Map(); },
    get(track)          { return _map.get(_makeKey(track)); },
    set(track, tagData) { _map.set(_makeKey(track), tagData); },
    delete(track)       { _map.delete(_makeKey(track)); },
    has(track)          { return _map.has(_makeKey(track)); },

    getStats(tracks) {
      const genreCounts = {};
      let untagged = 0;
      tracks.forEach(track => {
        const tag = _map.get(_makeKey(track));
        if (!tag?.genres?.length) { untagged++; return; }
        tag.genres.forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
      });
      return { genreCounts, untagged, total: tracks.length };
    },

    async loadManual(tracks) {
      return _serialized(async () => {
        const data = await _read([MANUAL_KEY, 'ytme_manual_tags']);
        const manual = { ..._record(data[MANUAL_KEY]) };
        const requested = new Set(tracks.map(_makeKey));
        const candidates = new Map();
        for (const legacy of Object.values(_record(data.ytme_manual_tags))) {
          // The old lossy key cannot identify a track. Require original metadata.
          if (!legacy || typeof legacy.title !== 'string' || !legacy.title.trim() ||
              typeof legacy.artist !== 'string' || !Array.isArray(legacy.genres)) continue;
          const key = _makeKey({ rawTitle: legacy.title, rawArtist: legacy.artist });
          if (!requested.has(key) || Object.hasOwn(manual, key)) continue;
          const candidate = { genres: _genres(legacy.genres), title: legacy.title, artist: legacy.artist };
          if (candidates.has(key)) {
            const previous = candidates.get(key);
            if (!previous || JSON.stringify(previous.genres) !== JSON.stringify(candidate.genres)) candidates.set(key, null);
          } else candidates.set(key, candidate);
        }
        let changed = false;
        for (const [key, candidate] of candidates) {
          if (candidate) { manual[key] = candidate; changed = true; }
        }
        if (changed) await _write({ [MANUAL_KEY]: manual });
        tracks.forEach(track => {
          const key = _makeKey(track);
          const saved = manual[key];
          if (saved?.deleted) {
            if (_map.get(key)?.source === 'manual') _map.delete(key);
          } else if (saved && Array.isArray(saved.genres)) {
            _map.set(key, { genres: _genres(saved.genres), source: 'manual' });
          }
        });
      });
    },

    async saveManual(track, genres) {
      return _serialized(async () => {
        const data = await _read(null);
        const key = _makeKey(track);
        const cleanGenres = _genres(genres);
        const manual = { ..._record(data[MANUAL_KEY]), [key]: {
          genres: cleanGenres, title: track.rawTitle, artist: track.rawArtist || '',
        } };
        const updates = { [MANUAL_KEY]: manual };
        for (const [storageKey, value] of Object.entries(data)) {
          if (storageKey.startsWith(SNAPSHOT_PREFIX) && Object.hasOwn(_record(value), key)) {
            updates[storageKey] = { ...value, [key]: { genres: cleanGenres, source: 'manual' } };
          }
        }
        await _write(updates);
        _map.set(key, { genres: cleanGenres, source: 'manual' });
        window.dispatchEvent(new CustomEvent('ytme:tags-updated'));
      });
    },

    async removeManual(track) {
      return _serialized(async () => {
        const data = await _read(null);
        const key = _makeKey(track);
        // Tombstone prevents a preserved legacy record from being re-imported.
        const manual = { ..._record(data[MANUAL_KEY]), [key]: { deleted: true } };
        const updates = { [MANUAL_KEY]: manual };
        for (const [storageKey, value] of Object.entries(data)) {
          if (storageKey.startsWith(SNAPSHOT_PREFIX) && Object.hasOwn(_record(value), key)) {
            const snapshot = { ...value };
            delete snapshot[key];
            updates[storageKey] = snapshot;
          }
        }
        await _write(updates);
        _map.delete(key);
      });
    },

    // save tag state so we can restore it next time
    async savePlaylistSnapshot(playlistId, tracks) {
      if (!playlistId) return;
      return _serialized(async () => {
        const data = await _read(MANUAL_KEY);
        const manual = _record(data[MANUAL_KEY]);
        const snapshot = {};
        tracks.forEach(t => {
          const key = _makeKey(t);
          let tags = _map.get(key);
          const saved = manual[key];
          if (saved?.deleted && tags?.source === 'manual') return;
          if (saved && !saved.deleted && Array.isArray(saved.genres)) tags = { genres: _genres(saved.genres), source: 'manual' };
          if (tags?.genres?.length > 0) snapshot[key] = { genres: tags.genres, source: tags.source };
        });
        await _write({ [`${SNAPSHOT_PREFIX}${playlistId}`]: snapshot });
      });
    },

    // restore tags from a previous session if we have one
    async loadPlaylistSnapshot(playlistId, tracks) {
      if (!playlistId) return false;
      return _serialized(async () => {
        // Legacy snapshots have no original metadata; never guess their identity.
        const storageKey = `${SNAPSHOT_PREFIX}${playlistId}`;
        const data = await _read([storageKey, MANUAL_KEY]);
        const snapshot = _record(data[storageKey]);
        const manual = _record(data[MANUAL_KEY]);
        let applied = 0;
        tracks.forEach(t => {
          const key = _makeKey(t);
          const cached = snapshot[key];
          if (cached?.source === 'manual' && manual[key]?.deleted) return;
          if (_genres(cached?.genres).length > 0) {
            _map.set(key, { genres: _genres(cached.genres), source: cached.source });
            applied++;
          }
        });
        return applied > 0;
      });
    },
  };
})();

const GenreClassifier = (() => {
  function _buildPattern(keywords) {
    if (!keywords?.length) return null;
    const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
  }

  const _compiled = Object.entries(GENRE_DATABASE).map(([genre, { titleKeywords, artistKeywords }]) => ({
    genre,
    titlePattern:  _buildPattern(titleKeywords),
    artistPattern: _buildPattern(artistKeywords),
  }));

  return {
    // run the track through all rules and return matches
    classify(track) {
      const title  = (track.rawTitle  || '').toLowerCase();
      const artist = (track.rawArtist || '').toLowerCase();
      const genres = [];
      for (const { genre, titlePattern, artistPattern } of _compiled) {
        if (genres.includes(genre)) continue;
        if (titlePattern?.test(title))   { genres.push(genre); continue; }
        if (artistPattern?.test(artist)) { genres.push(genre); }
      }
      return genres;
    },

    // apply rules to everything
    applyRules(tracks) {
      let tagged = 0;
      tracks.forEach(track => {
        if (TagStore.get(track)?.source === 'manual') return;
        const genres = this.classify(track);
        if (genres.length) { TagStore.set(track, { genres, source: 'rule' }); tagged++; }
      });
      console.log(`[YTM-Tagger] Rules: ${tagged}/${tracks.length} tagged`);
    },
  };
})();

const LastFmClient = (() => {
  function _isValidArtist(name) {
    if (!name || name.length < 2 || name.length > 80) return false;
    if (name.split(' ').length > 5) return false;
    if (/[\[\]【】「」『』（）]/.test(name)) return false;
    if (/CV[:：]/.test(name)) return false;
    if (/^\d+$/.test(name)) return false;
    if (/official|channel|records|productions/i.test(name) && name.split(' ').length > 2) return false;
    return true;
  }

  // "Artist A, Artist B & Artist C" → ["Artist A", "Artist B", "Artist C"] -- splits multi-artist strings
  function _splitArtists(raw) {
    return (raw || '').split(/,|&|\n/).map(a => a.trim()).filter(a => a.length > 1);
  }

  function _normalizeArtist(name) {
    return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  async function _loadCache() {
    return new Promise(resolve => {
      chrome.storage.local.get('ytme_genre_cache', data => resolve(data.ytme_genre_cache || {}));
    });
  }

  async function _saveCache(cache) {
    return new Promise(resolve => chrome.storage.local.set({ ytme_genre_cache: cache }, resolve));
  }

  async function _fetchArtistGenres(artistName) {
    if (!artistName) return [];
    const url = `${LASTFM_BASE_URL}?method=artist.gettoptags&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_API_KEY}&format=json&limit=10&autocorrect=1`;
    const res  = await fetch(url);
    // console.log('[debug] last.fm fetch:', artistName); // left this in, helps when something breaks
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`Last.fm ${data.error}: ${data.message}`);

    const genres = [];
    for (const tag of (data?.toptags?.tag || [])) {
      const count = parseInt(tag.count) || 0;
      if (count < LASTFM_MIN_COUNT) continue;
      const mapped = LASTFM_TAG_MAP[tag.name?.toLowerCase().trim()];
      if (mapped && !genres.includes(mapped)) genres.push(mapped);
    }
    return genres;
  }

  return {
    async applyTags(tracks) {
      const cache = await _loadCache();

      // Collect all artists that aren't in cache yet — don't filter by tag status here,
      // otherwise already-tagged tracks' artists never get fetched and stay unresolved.
      const untaggedArtists = [...new Set(
        tracks
          .filter(t => t.rawArtist?.trim())
          .flatMap(t => _splitArtists(t.rawArtist))
          .filter(a => _isValidArtist(a) && !(_normalizeArtist(a) in cache))
      )];

      console.log(untaggedArtists.length
        ? `[YTM-Tagger] Last.fm: fetching ${untaggedArtists.length} new artists`
        : '[YTM-Tagger] Last.fm: everything is cached, nothing to fetch');

      for (let i = 0; i < untaggedArtists.length; i += LASTFM_BATCH) {
        const batch = untaggedArtists.slice(i, i + LASTFM_BATCH);
        await Promise.allSettled(batch.map(async artist => {
          try {
            const genres = await _fetchArtistGenres(artist);
            cache[_normalizeArtist(artist)] = genres;
          } catch {
            cache[_normalizeArtist(artist)] = [];
          }
        }));
        await new Promise(r => setTimeout(r, LASTFM_DELAY_MS));
      }

      await _saveCache(cache);

      let apiTagged = 0;
      tracks.forEach(track => {
        if (TagStore.get(track)?.source === 'manual') return;
        const allGenres = [];
        _splitArtists(track.rawArtist).forEach(artist => {
          const genres = cache[_normalizeArtist(artist)];
          if (genres?.length) allGenres.push(...genres);
        });
        if (!allGenres.length) return;

        const existing = TagStore.get(track);
        TagStore.set(track, {
          genres: [...new Set([...(existing?.genres || []), ...allGenres])],
          source: existing?.source === 'rule' ? 'rule+api' : 'api',
        });
        apiTagged++;
      });

      console.log(`[YTM-Tagger] Last.fm: ${apiTagged} tracks tagged`);
      window.dispatchEvent(new CustomEvent('ytme:tags-updated', {
        detail: { stage: 'enriched', source: 'lastfm' }
      }));
    },
  };
})();

const FilterEngine = {
  // hide tracks that dont match active genres
  apply(tracks, activeGenres) {
    const showUntagged = activeGenres.includes('Untagged');
    const realGenres   = activeGenres.filter(g => g !== 'Untagged');
    let visible = 0;
    tracks.forEach(track => {
      const el = track.element;
      if (!el) return;
      if (!activeGenres.length) { el.style.display = ''; visible++; return; }
      const genres     = TagStore.get(track)?.genres || [];
      const isUntagged = !genres.length;
      const match = (showUntagged && isUntagged) ||
                    (realGenres.length && realGenres.some(g => genres.includes(g)));
      el.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    return visible;
  },

  // show everything
  clear(tracks) {
    tracks.forEach(track => { if (track.element) track.element.style.display = ''; });
  },
};

window.__ytmeTagger = {
  // fast init, skip last.fm for the first render
  async _fastInit(tracks, playlistId) {
    TagStore.clear();
    await TagStore.loadPlaylistSnapshot(playlistId, tracks);
    GenreClassifier.applyRules(tracks);
    await TagStore.loadManual(tracks);
    window.dispatchEvent(new CustomEvent('ytme:tags-updated', {
      detail: { stage: 'initial', source: 'fast-init', playlistId }
    }));
  },

  // full pipeline: snapshot → rules → manual → last.fm
  async run(tracks) {
    const sessionId = ++window.__ytmeRunSessionId;
    TagStore.clear();

    const playlistId = new URLSearchParams(window.location.search).get('list');
    console.log(`[YTM-Tagger] Session ${sessionId} — playlist: ${playlistId || 'unknown'}`);

    const hasSnapshot = await TagStore.loadPlaylistSnapshot(playlistId, tracks);
    GenreClassifier.applyRules(tracks);
    await TagStore.loadManual(tracks);

    window.dispatchEvent(new CustomEvent('ytme:tags-updated', {
      detail: { stage: 'initial', source: hasSnapshot ? 'snapshot' : 'rules', playlistId }
    }));

    chrome.storage.local.get('ytme_settings', data => {
      const settings = data.ytme_settings || {};
      if (settings.toggleGenreFetch !== false) {
        LastFmClient.applyTags(tracks)
          .catch(err => console.error('[YTM-Tagger] Last.fm error:', err))
          .finally(async () => {
            if (sessionId !== window.__ytmeRunSessionId) {
              console.log(`[YTM-Tagger] Session ${sessionId} is stale, bailing out`);
              return;
            }
            await TagStore.savePlaylistSnapshot(playlistId, tracks);
            window.dispatchEvent(new CustomEvent('ytme:tags-updated', {
              detail: { stage: 'enriched', source: 'lastfm', playlistId }
            }));
          })
          .catch(err => console.error('[YTM-Tagger] Snapshot save failed:', err));
      } else {
        TagStore.savePlaylistSnapshot(playlistId, tracks)
          .catch(err => console.error('[YTM-Tagger] Snapshot save failed:', err));
      }
    });
  },

  filterTracks:    (tracks, genres) => FilterEngine.apply(tracks, genres),
  clearFilters:    tracks           => FilterEngine.clear(tracks),
  getStats:        tracks             => TagStore.getStats(tracks),
  getTags:         track                => TagStore.get(track),
  saveManualTag:   (track, genres)    => TagStore.saveManual(track, genres),
  removeManualTag: track              => TagStore.removeManual(track),
  _clearStore:     ()                 => TagStore.clear(),

  // returns tag picker HTML, goes outside shadow DOM
  getTagPickerHTML() {
    return `
<div id="tag-picker" style="display:none;position:fixed;background:color-mix(in srgb, var(--ytme-bg) 95%, transparent);backdrop-filter:blur(40px);border:1px solid var(--ytme-border);border-radius:16px;width:360px;padding:20px;z-index:2147483647;box-shadow:0 40px 100px rgba(0,0,0,1);">
  <div id="tag-picker-title" style="font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;color:var(--ytme-text);margin-bottom:8px;letter-spacing:0.02em;">Manual Tag</div>
  <div id="tag-picker-artist" style="font-family:'DM Mono',monospace;font-size:9px;color:color-mix(in srgb, var(--ytme-text) 40%, transparent);margin-bottom:16px;letter-spacing:0.05em;"></div>
  <div class="tag-picker-pills" id="tag-picker-pills" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;"></div>
  <div class="tag-picker-actions" style="display:flex;gap:8px;justify-content:flex-end;">
    <button class="tb-btn" id="tag-picker-cancel" style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;padding:8px 16px;cursor:pointer;border:none;background:color-mix(in srgb, var(--ytme-text) 3%, transparent);color:color-mix(in srgb, var(--ytme-text) 50%, transparent);transition:all .2s;border-radius:8px;">Cancel</button>
    <button class="tb-btn" id="tag-picker-save" style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;padding:8px 16px;cursor:pointer;border:none;background:color-mix(in srgb, var(--ytme-text) 3%, transparent);color:var(--ytme-accent);transition:all .2s;border-radius:8px;">Continue</button>
  </div>
</div>`;
  },

  // tag picker CSS -- global cus it's outside shadow DOM
  getTagPickerCSS() {
    return `
.tag-pill{font-family:'DM Mono',monospace;font-size:9px;padding:4px 10px;background:transparent;border:1px solid var(--ytme-border);color:color-mix(in srgb, var(--ytme-text) 50%, transparent);cursor:pointer;transition:all .2s;}
.tag-pill:hover{border-color:var(--ytme-text);color:var(--ytme-text);}
.tag-pill.selected{background:color-mix(in srgb, var(--ytme-accent) 10%, transparent);border-color:var(--ytme-accent);color:var(--ytme-accent);}
.tb-btn{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;padding:8px 16px;cursor:pointer;border:none;background:color-mix(in srgb, var(--ytme-text) 3%, transparent);color:color-mix(in srgb, var(--ytme-text) 50%, transparent);transition:all .2s;border-radius:8px;}
.tb-btn:hover{background:color-mix(in srgb, var(--ytme-text) 8%, transparent);color:var(--ytme-text);}
.tb-btn-danger{background:rgba(239,68,68,0.05);color:#ef4444;}
.tb-btn-danger:hover{background:rgba(239,68,68,0.15);}
`;
  },
};

console.log('[YTM-Tagger] ready');  // we're live
}
