// Only notify the content script once for each top-level SPA URL.
const lastNavigationByTab = new Map();

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (!details.url || !Number.isInteger(details.tabId) || details.frameId !== 0) return;
  if (lastNavigationByTab.get(details.tabId) === details.url) return;
  lastNavigationByTab.set(details.tabId, details.url);

  chrome.tabs.sendMessage(details.tabId, { type: 'NAVIGATED', url: details.url }, () => {
    chrome.runtime.lastError; 
  });
}, {
  url: [
    { hostContains: 'music.youtube.com', schemes: ['https'] }
  ]
});

chrome.tabs.onRemoved.addListener(tabId => lastNavigationByTab.delete(tabId));
