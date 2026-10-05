const test = require('node:test');
const assert = require('node:assert/strict');
const { tagHarness } = require('./helpers.cjs');

const track = (rawTitle, rawArtist = 'Artist') => ({ rawTitle, rawArtist });
const key = t => `v2:${JSON.stringify([t.rawTitle.normalize('NFC').trim(), t.rawArtist.normalize('NFC').trim()])}`;
const genres = value => Array.from(value?.genres || []);

test('Japanese/Turkish text, punctuation, case and tuple separators retain identity', () => {
  const { TagStore } = tagHarness();
  const items = [track('東京','作曲家'), track('大阪','別人'), track('Şarkı','Oğuzhan Koç'),
    track('Sarki','Oguzhan Koc'), track('A|B','C'), track('A','B|C'), track('Song!'), track('Song'), track('song')];
  items.forEach((t, i) => TagStore.set(t, { genres: [`genre-${i}`], source: 'manual' }));
  items.forEach((t, i) => assert.deepEqual(genres(TagStore.get(t)), [`genre-${i}`]));
});

test('NFC equivalents and surrounding whitespace use the same key', () => {
  const { TagStore } = tagHarness();
  TagStore.set(track(' Café ', ' Şarkıcı '), { genres: ['Rock'], source: 'manual' });
  assert.deepEqual(genres(TagStore.get(track('Cafe\u0301', 'S\u0327arkıcı'))), ['Rock']);
  assert.equal(TagStore.get(track('Ca fé', 'Şarkıcı')), undefined);
});

test('legacy migration uses original metadata, preserves old storage and is repeatable', async () => {
  const a = track('東京','作曲家'), b = track('大阪','別人');
  const legacy = { '|': { genres: ['Rock'], title: a.rawTitle, artist: a.rawArtist } };
  const h = tagHarness({ ytme_manual_tags: legacy });
  await h.TagStore.loadManual([a,b]);
  assert.deepEqual(genres(h.TagStore.get(a)), ['Rock']);
  assert.equal(h.TagStore.get(b), undefined);
  assert.deepEqual(h.data().ytme_manual_tags, legacy);
  const first = h.data();
  h.TagStore.clear();
  await h.TagStore.loadManual([a,b]);
  assert.deepEqual(h.data(), first);
  assert.equal(h.TagStore.get(b), undefined);
});

test('missing metadata and conflicting legacy originals are not guessed', async () => {
  const t = track('Song');
  const h = tagHarness({ ytme_manual_tags: {
    'song|artist': { genres: ['Rock'] },
    one: { title: 'Song', artist: 'Artist', genres: ['Jazz'] },
    two: { title: ' Song ', artist: 'Artist', genres: ['Pop'] },
    invalid: { title: 'Other', genres: ['Metal'] },
  } });
  await h.TagStore.loadManual([t, track('Other')]);
  assert.equal(h.TagStore.get(t), undefined);
  assert.equal(h.TagStore.get(track('Other')), undefined);
  assert.equal(h.data().ytme_manual_tags_v2, undefined);
});

test('new manual value takes priority over legacy value and snapshot', async () => {
  const t = track('Song');
  const h = tagHarness({
    ytme_manual_tags: { old: { title: 'Song', artist: 'Artist', genres: ['Rock'] } },
    ytme_manual_tags_v2: { [key(t)]: { genres: ['Jazz'], title: 'Song', artist: 'Artist' } },
    ytme_snapshot_v2_TEST: { [key(t)]: { genres: ['Metal'], source: 'manual' } },
  });
  await h.TagStore.loadPlaylistSnapshot('TEST', [t]);
  await h.TagStore.loadManual([t]);
  assert.deepEqual(genres(h.TagStore.get(t)), ['Jazz']);
  await h.TagStore.savePlaylistSnapshot('TEST', [t]);
  assert.deepEqual(h.data().ytme_snapshot_v2_TEST[key(t)].genres, ['Jazz']);
});

test('legacy snapshots are preserved but not applied; rules can recalculate', async () => {
  const t = track('Jazz music');
  const legacy = { 'jazz music|artist': { genres: ['Rock'], source: 'manual' } };
  const h = tagHarness({ ytme_snapshot_TEST: legacy });
  assert.equal(await h.TagStore.loadPlaylistSnapshot('TEST', [t]), false);
  assert.equal(h.TagStore.get(t), undefined);
  h.TagStore.set(t, { genres: ['Jazz'], source: 'rule' });
  await h.TagStore.savePlaylistSnapshot('TEST', [t]);
  assert.deepEqual(h.data().ytme_snapshot_TEST, legacy);
  h.TagStore.clear();
  assert.equal(await h.TagStore.loadPlaylistSnapshot('TEST', [t]), true);
  assert.deepEqual(genres(h.TagStore.get(t)), ['Jazz']);
});

test('manual deletion clears memory and all new snapshots without reviving legacy tags', async () => {
  const t = track('東京','作曲家'), other = track('大阪','別人');
  const legacy = { '|': { genres: ['Rock'], title: t.rawTitle, artist: t.rawArtist } };
  const h = tagHarness({
    ytme_manual_tags: legacy,
    ytme_snapshot_TEST: { '|': { genres: ['Rock'], source: 'manual' } },
    ytme_snapshot_v2_A: { [key(t)]: { genres: ['Rock'], source: 'manual' } },
    ytme_snapshot_v2_B: { [key(t)]: { genres: ['Rock'], source: 'manual' }, [key(other)]: { genres: ['Pop'], source: 'rule' } },
  });
  await h.TagStore.loadManual([t]);
  await h.TagStore.removeManual(t);
  assert.equal(h.TagStore.get(t), undefined);
  assert.equal(h.data().ytme_snapshot_v2_A[key(t)], undefined);
  assert.equal(h.data().ytme_snapshot_v2_B[key(t)], undefined);
  assert.deepEqual(h.data().ytme_snapshot_v2_B[key(other)].genres, ['Pop']);
  assert.deepEqual(h.data().ytme_manual_tags, legacy);
  assert.equal(h.data().ytme_manual_tags_v2[key(t)].deleted, true);
  const restarted = tagHarness(h.data());
  await restarted.TagStore.loadPlaylistSnapshot('TEST', [t]);
  await restarted.TagStore.loadManual([t]);
  assert.equal(restarted.TagStore.get(t), undefined);
  // Even a stale manual snapshot from another page cannot defeat the tombstone.
  restarted.TagStore.set(t, { genres: ['Rock'], source: 'manual' });
  await restarted.TagStore.savePlaylistSnapshot('TEST', [t]);
  assert.equal(restarted.data().ytme_snapshot_v2_TEST[key(t)], undefined);
});

test('explicit re-tag after deletion replaces tombstone and persists across reload', async () => {
  const t = track('Song'); const h = tagHarness();
  await h.TagStore.saveManual(t, ['Rock']);
  await h.TagStore.removeManual(t);
  await h.TagStore.saveManual(t, ['Jazz']);
  const reloaded = tagHarness(h.data());
  await reloaded.TagStore.loadManual([t]);
  assert.deepEqual(genres(reloaded.TagStore.get(t)), ['Jazz']);
  assert.equal(reloaded.data().ytme_manual_tags_v2[key(t)].deleted, undefined);
});

test('concurrent migration, snapshot and delete preserve deletion in queue order', async () => {
  const t = track('Song');
  const h = tagHarness({ ytme_manual_tags: { old: { title: 'Song', artist: 'Artist', genres: ['Rock'] } } });
  await Promise.all([
    h.TagStore.loadManual([t]),
    h.TagStore.savePlaylistSnapshot('TEST', [t]),
    h.TagStore.removeManual(t),
    h.TagStore.savePlaylistSnapshot('TEST', [t]),
    h.TagStore.loadManual([t]),
  ]);
  assert.equal(h.TagStore.get(t), undefined);
  assert.equal(h.data().ytme_snapshot_v2_TEST[key(t)], undefined);
  assert.equal(h.data().ytme_manual_tags_v2[key(t)].deleted, true);
});

test('concurrent manual saves on this page do not overwrite each other', async () => {
  const a = track('Song A'), b = track('Song B'); const h = tagHarness();
  await Promise.all([h.TagStore.saveManual(a, ['Rock']), h.TagStore.saveManual(b, ['Jazz'])]);
  assert.deepEqual(h.data().ytme_manual_tags_v2[key(a)].genres, ['Rock']);
  assert.deepEqual(h.data().ytme_manual_tags_v2[key(b)].genres, ['Jazz']);
});

test('shared Web Lock prevents concurrent tabs from overwriting tags or deletion markers', async () => {
  const queues = new Map();
  const shared = { storage: { data: {} }, locks: { request(name, work) {
    const result = (queues.get(name) || Promise.resolve()).then(work);
    queues.set(name, result.catch(() => {}));
    return result;
  } } };
  const a = track('東京','作曲家'), b = track('大阪','別人');
  const first = tagHarness({}, shared), second = tagHarness({}, shared);
  await Promise.all([first.TagStore.saveManual(a, ['Rock']), second.TagStore.saveManual(b, ['Jazz'])]);
  assert.deepEqual(first.data().ytme_manual_tags_v2[key(a)].genres, ['Rock']);
  assert.deepEqual(first.data().ytme_manual_tags_v2[key(b)].genres, ['Jazz']);
  await Promise.all([first.TagStore.removeManual(a), second.TagStore.saveManual(b, ['Pop'])]);
  assert.equal(first.data().ytme_manual_tags_v2[key(a)].deleted, true);
  assert.deepEqual(first.data().ytme_manual_tags_v2[key(b)].genres, ['Pop']);
});

test('failed storage writes reject without changing memory or destroying legacy data', async () => {
  const t = track('Song');
  const initial = { ytme_manual_tags: { old: { title: 'Song', artist: 'Artist', genres: ['Rock'] } } };
  const h = tagHarness(initial); h.failWrites(true);
  await assert.rejects(h.TagStore.loadManual([t]), /quota exceeded/);
  assert.equal(h.TagStore.get(t), undefined);
  assert.deepEqual(h.data(), initial);
  h.failWrites(false); await h.TagStore.loadManual([t]);
  h.failWrites(true); await assert.rejects(h.TagStore.removeManual(t), /quota exceeded/);
  assert.deepEqual(genres(h.TagStore.get(t)), ['Rock']);
  await assert.rejects(h.TagStore.saveManual(t, ['Jazz']), /quota exceeded/);
  assert.deepEqual(genres(h.TagStore.get(t)), ['Rock']);
});

test('malformed stored values do not crash migration or snapshot loading', async () => {
  const t = track('Song');
  const h = tagHarness({ ytme_manual_tags: [null], ytme_manual_tags_v2: null,
    ytme_snapshot_v2_TEST: { [key(t)]: { genres: 'Rock', source: 'manual' } } });
  await h.TagStore.loadManual([t]);
  assert.equal(await h.TagStore.loadPlaylistSnapshot('TEST', [t]), false);
  assert.equal(h.TagStore.get(t), undefined);
});
