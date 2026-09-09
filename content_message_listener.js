// standalone fallback listener — only injected when main content script hasnt loaded yet
// in normal flow MessageBridge in content.js handles all of this
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'GET_TRACKS') return;

  // full tagger is running, use it
  if (typeof PlaylistProcessor !== 'undefined') {
    const tracks = PlaylistProcessor.extractTracks();
    const playlistTitle = window.__ytmeDom?.getPlaylistTitle(document) || document.title || 'My Playlist';
    sendResponse({ tracks, playlistTitle });
    return true;
  }

  // Never maintain a second selector set here. The shared contract either
  // understands the current YTM structure or reports that it is unavailable.
  if (!window.__ytmeDom) {
    sendResponse({ tracks: [], playlistTitle: document.title || 'My Playlist', error: 'DOM_CONTRACT_UNAVAILABLE' });
    return true;
  }

  const tracks = window.__ytmeDom.getTrackElements(document)
    .map((el, idx) => window.__ytmeDom.getTrackData(el, idx));

  const playlistTitle = window.__ytmeDom?.getPlaylistTitle(document) || document.title || 'My Playlist';
  sendResponse({ tracks, playlistTitle });
  return true;
});
