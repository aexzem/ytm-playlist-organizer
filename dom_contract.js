(function initYtmDomContract(root) {
  'use strict';

  if (root.__ytmeDom) return;

  const selectors = Object.freeze({
    searchBox: 'ytmusic-search-box',
    playlistShelf: 'ytmusic-playlist-shelf-renderer',
    trackRows: '#contents > ytmusic-responsive-list-item-renderer[is-playlist-detail-page]',
    trackTitle: '.title',
    trackArtist: '.secondary-flex-columns > .flex-column:first-child yt-formatted-string',
    trackDuration: '.fixed-columns yt-formatted-string.fixed-column[aria-label], .fixed-columns yt-formatted-string.fixed-column',
    trackThumb: 'ytmusic-thumbnail-renderer img#img',
    fixedColumns: '.fixed-columns',
    playlistTitle: 'ytmusic-responsive-header-renderer h1 yt-formatted-string.title',
    playlistMetadata: 'ytmusic-responsive-header-renderer yt-formatted-string.second-subtitle',
    playlistContents: 'ytmusic-playlist-shelf-renderer #contents',
    actionMenu: 'ytmusic-menu-renderer.menu > yt-button-shape#button-shape > button',
    menuServiceItems: 'ytmusic-menu-popup-renderer ytmusic-menu-service-item-renderer',
    activeContinuations: 'ytmusic-playlist-shelf-renderer #contents > ytmusic-continuation-item-renderer, #continuations > yt-next-continuation',
  });

  // YouTube renders playlist metadata in semantic order: [views,] track count, duration.
  // Position is stable across locales; translated words are deliberately ignored.
  const REMOVE_ICON_PREFIX = 'M14.25 2.25h-3V1.5';
  const CONTINUATION_PULSE_MS = 600;
  const continuationPulses = new WeakMap();

  function textOf(element) {
    return (element?.getAttribute?.('aria-label') || element?.innerText || element?.textContent || '').trim();
  }

  function parseInteger(text) {
    const match = String(text || '').match(/(?:^|\D)(\d[\d.,\s]*)(?:\D|$)/);
    if (!match) return null;
    const value = Number.parseInt(match[1].replace(/[\s.,]/g, ''), 10);
    return Number.isFinite(value) ? value : null;
  }

  function parseExpectedCount(parts) {
    const numericParts = (Array.isArray(parts) ? parts : [parts])
      .map(part => String(part || '').trim())
      .filter(value => value && parseInteger(value) !== null);
    if (!numericParts.length) return null;

    const trackPart = numericParts.length >= 2
      ? numericParts[numericParts.length - 2]
      : numericParts[0];
    return parseInteger(trackPart);
  }

  function validateExpectedCount(expected, loadedCount) {
    if (!Number.isInteger(expected) || expected < 0) return null;
    if (Number.isInteger(loadedCount) && loadedCount >= 0 && expected < loadedCount) return null;
    return expected;
  }

  function getPlaylistShelf(doc = document) {
    return doc.querySelector(selectors.playlistShelf);
  }

  function getTrackElements(doc = document) {
    const shelf = getPlaylistShelf(doc);
    if (!shelf) return [];
    return Array.from(shelf.querySelectorAll(selectors.trackRows))
      .filter(row => textOf(row.querySelector(selectors.trackTitle)).length > 0);
  }

  function getDescendantTrackRows(element) {
    if (!element?.querySelectorAll) return [];
    return Array.from(element.querySelectorAll('ytmusic-responsive-list-item-renderer[is-playlist-detail-page]'))
      .filter(isTrackRow);
  }

  function getExpectedCount(doc = document) {
    const metadata = doc.querySelector(selectors.playlistMetadata);
    if (!metadata) return null;
    const parts = Array.from(metadata.children || []).map(textOf).filter(text => text && text !== '•');
    const expected = parseExpectedCount(parts.length ? parts : textOf(metadata).split('•'));
    return validateExpectedCount(expected, getTrackElements(doc).length);
  }

  function getPlaylistTitle(doc = document) {
    return textOf(doc.querySelector(selectors.playlistTitle)) || doc.title || 'My Playlist';
  }

  function getArtist(row) {
    return textOf(row?.querySelector(selectors.trackArtist));
  }

  function getTrackData(row, idx = 0) {
    return {
      idx,
      element: row,
      rawTitle: textOf(row?.querySelector(selectors.trackTitle)),
      rawArtist: getArtist(row),
      duration: textOf(row?.querySelector(selectors.trackDuration)),
      thumb: row?.querySelector(selectors.trackThumb)?.src || '',
    };
  }

  function getPlaylistContents(doc = document) {
    return doc.querySelector(selectors.playlistContents);
  }

  function isTrackRow(element) {
    return Boolean(element?.matches?.('ytmusic-responsive-list-item-renderer[is-playlist-detail-page]') &&
      element.parentElement?.id === 'contents' &&
      element.closest?.(selectors.playlistShelf));
  }

  function getActionMenuButton(row) {
    return row?.querySelector(selectors.actionMenu) || null;
  }

  function getFixedColumns(row) {
    return row?.querySelector(selectors.fixedColumns) || null;
  }

  function getRemoveMenuItem(doc = document) {
    return Array.from(doc.querySelectorAll(selectors.menuServiceItems)).find(element => {
      const path = element.querySelector('yt-icon svg path')?.getAttribute('d') || '';
      return path.startsWith(REMOVE_ICON_PREFIX);
    }) || null;
  }

  function getVisibleContinuation(doc = document) {
    return Array.from(doc.querySelectorAll(selectors.activeContinuations)).find(element => {
      const rect = element.getBoundingClientRect?.();
      const style = doc.defaultView?.getComputedStyle?.(element);
      return (!style || (style.display !== 'none' && style.visibility !== 'hidden')) &&
        (!rect || rect.height > 0 || rect.width > 0);
    }) || null;
  }

  function requestMoreTracks(doc = document) {
    const continuation = getVisibleContinuation(doc);
    if (!continuation?.style) return false;
    if (continuationPulses.has(continuation)) return true;

    const saved = {
      transform: continuation.style.transform,
      opacity: continuation.style.opacity,
      pointerEvents: continuation.style.pointerEvents,
      willChange: continuation.style.willChange,
    };

    // Keep the renderer in normal document flow. YTM's current continuation
    // observer no longer responds when its target is position:fixed, but it
    // does observe a transformed target. The near-transparent pulse brings
    // only the loader into the viewport without moving the user's scroll.
    const rect = continuation.getBoundingClientRect?.();
    const translateY = Math.max(0, (Number(rect?.top) || 0) - 8);

    Object.assign(continuation.style, {
      transform: `translate3d(0, -${translateY}px, 0)`,
      opacity: '0.001',
      pointerEvents: 'none',
      willChange: 'transform',
    });

    const timer = root.setTimeout(() => {
      Object.assign(continuation.style, saved);
      continuationPulses.delete(continuation);
    }, CONTINUATION_PULSE_MS);
    continuationPulses.set(continuation, timer);
    return true;
  }

  const api = Object.freeze({
    selectors,
    textOf,
    parseExpectedCount,
    validateExpectedCount,
    getPlaylistShelf,
    getTrackElements,
    getDescendantTrackRows,
    getExpectedCount,
    getPlaylistTitle,
    getArtist,
    getTrackData,
    getPlaylistContents,
    isTrackRow,
    getActionMenuButton,
    getFixedColumns,
    getRemoveMenuItem,
    getVisibleContinuation,
    requestMoreTracks,
  });

  root.__ytmeDom = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
