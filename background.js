// Background script for Copilot Sidebar Extension

// When the extension is installed or updated, set up the sidebar
chrome.runtime.onInstalled.addListener(() => {
  // Enable the side panel on all URLs
  chrome.sidePanel.setOptions({
    enabled: true,
    path: 'sidebar.html'
  });
});

// When the extension's action button is clicked, open the sidebar
chrome.action.onClicked.addListener((tab) => {
  // Open the side panel
  chrome.sidePanel.open({ tabId: tab.id });
});