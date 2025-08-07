// Background script for Copilot Sidebar Extension

// Small helper: flash text on the toolbar badge briefly
function flashBadge(text, color, ms = 2000) {
  try {
    if (color) chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text: String(text || '') });
    // Clear after a short delay; safe within MV3 service worker lifetime
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, Math.max(300, ms));
  } catch (e) {
    // Ignore badge errors (older browsers or missing action)
    console.warn('flashBadge error:', e);
  }
}

// Utility: write text to clipboard from background using a temporary tab page
// navigator.clipboard is not available in service worker; use tabs.executeScript to write in-page.
async function writeToClipboardViaPage(tabId, text) {
  try {
    // Try the modern Clipboard API within the page context
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [text],
      func: async (t) => {
        try {
          // Prefer navigator.clipboard if available in the page
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(t);
            return true;
          }
        } catch (_) {
          // fall through to execCommand
        }
        // Fallback: create a temporary textarea and execCommand('copy')
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } finally {
          ta.remove();
        }
        return ok;
      }
    });
    return true;
  } catch (e) {
    console.error('Page clipboard write failed:', e);
    return false;
  }
}

// When the extension is installed or updated, set up the sidebar
chrome.runtime.onInstalled.addListener(() => {
  // Enable the side panel on all URLs
  chrome.sidePanel.setOptions({
    enabled: true,
    path: 'sidebar.html'
  });
  // Set a default badge background color
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
    chrome.action.setBadgeText({ text: '' });
  } catch (e) {
    console.warn('Badge init error:', e);
  }
});

// When the extension's action button is clicked, open the sidebar
chrome.action.onClicked.addListener(async (tab) => {
  // Open the side panel (action clicks count as user gestures)
  await chrome.sidePanel.open({ tabId: tab.id });
  // Also trigger extraction after opening
  chrome.runtime.sendMessage({ type: 'TRIGGER_EXTRACTION' });
  // Provide a subtle badge cue that the panel was opened
  flashBadge('↯', '#1a73e8', 1000);
});

// Listen for keyboard command to extract and copy to clipboard without opening sidebar.
// Alt+E mapped to "extension.extractAndCopy" in manifest.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'extension.extractAndCopy') return;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.id) return;

    // Execute the existing content-script extractor in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content-script.js']
    });

    let extractedText = '';
    if (results && results.length > 0) {
      const value = results[0].result;
      if (value && typeof value === 'object' && 'markdown' in value) {
        extractedText = value.markdown || '';
      } else if (typeof value === 'string') {
        extractedText = value;
      }
    }

    // Prepend the user's saved custom prompt (from sidebar) before the extracted content
    if (extractedText) {
      const pageTitle = activeTab.title || '';
      const pageUrl = activeTab.url || '';
      // Read the prompt saved by the sidebar from sync storage
      const { customPrompt } = await chrome.storage.sync.get('customPrompt');
      const headerParts = [];
      if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim().length > 0) {
        headerParts.push(customPrompt.trim());
      }
      // Always include a lightweight Source line for grounding
      headerParts.push(`Source: ${pageTitle} — ${pageUrl}`);
      const header = headerParts.join('\n') + '\n\n';
      extractedText = header + extractedText;
    }

    // Copy to clipboard via page context (service worker has no navigator.clipboard)
    if (extractedText) {
      const ok = await writeToClipboardViaPage(activeTab.id, extractedText);
      if (ok) {
        // Success: flash green OK + OS notification
        flashBadge('Done', '#1e8e3e', 2000);
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon128.png',
            title: 'Content copied',
            message: 'Saved prompt + extracted content copied to clipboard.'
          });
        } catch (_) {}
      } else {
        // Copy failed: flash red ERR + OS notification
        flashBadge('ERR', '#d93025', 2000);
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon128.png',
            title: 'Copy failed',
            message: 'Failed to copy saved prompt + content to clipboard.'
          });
        } catch (_) {}
      }
    } else {
      // No content extracted: flash neutral N/A + OS notification
      flashBadge('N/A', '#5f6368', 1800);
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon128.png',
          title: 'No content extracted',
          message: 'Could not extract content from this page.'
        });
      } catch (_) {}
    }
  } catch (err) {
    console.error('Command handling failed:', err);
    // Unexpected error: flash red ERR + OS notification
    flashBadge('ERR', '#d93025', 2200);
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: 'Extraction error',
        message: 'An error occurred while extracting content.'
      });
    } catch (_) {}
  }
});

// Remove unused REQUEST_OPEN_SIDEPANEL handler since we no longer auto-open the sidebar on Alt+E
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Keep listener stub in case other messages are added later; no-op for REQUEST_OPEN_SIDEPANEL
  return false;
});