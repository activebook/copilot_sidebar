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

// Track sidebar state
let sidebarOpenedTabId = null;

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
  // Try to inject paragraph-icons into the currently active tab after install/update
  injectParagraphIconsIntoActiveTab().catch(() => { });
});

// Listen for messages from sidebar about its state
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'SIDEBAR_OPENED') {
    // Update our state tracking
    if (sender.tab && sender.tab.id) {
      sidebarOpenedTabId = sender.tab.id;
    }
    return true;
  }

  if (msg.type === 'SIDEBAR_CLOSED') {
    // Clear our state tracking
    sidebarOpenedTabId = null;
    return true;
  }

  // Keep listener stub in case other messages are added later; no-op for other types
  return false;
});

// background.js
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel-channel') {
    port.onDisconnect.addListener(() => {
      // The side panel has been closed
      //console.log('Side panel was closed');
      // Perform any necessary cleanup here
      sidebarOpenedTabId = null;
    });
  }
});


// When the extension's action button is clicked, toggle the sidebar
chrome.action.onClicked.addListener(async (tab) => {
  // Check if sidebar is currently open by trying to send a message to it

  if (sidebarOpenedTabId !== null) {
    // Sidebar is open, try to close it

    // Provide visual feedback that we're closing the sidebar
    flashBadge('✕', '#FF9800', 500); // Orange X mark

    // Send message directly to the sidebar instead of tab content
    try {
      await chrome.runtime.sendMessage({ type: 'CLOSE_SIDEBAR' });      
    } catch (e) {
      
    }    
    // Update our state tracking
    sidebarOpenedTabId = null;
  } else {
    // Sidebar is not open, try to open it
    try {
      await chrome.sidePanel.open({ tabId: tab.id });

      // Also trigger extraction after opening
      // Wrap in a timeout to give the sidebar time to set up its message listener
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'TRIGGER_EXTRACTION' })
          .catch(() => {
            // This is expected if the sidebar isn't ready yet
          });
      }, 500);

      // Provide a subtle badge cue that the panel was opened
      flashBadge('↯', '#1a73e8', 1000);
      // Update our state tracking
      sidebarOpenedTabId = tab.id;
    } catch (e) {
      // If we can't open it, show an error
      console.error('Error opening side panel:', e);
      flashBadge('?', '#F44336', 1000); // Red question mark
    }
  }
});

const DEFAULT_FILTERS = `# Recommendation sections
Read More
Read Next
Also Read
Related Articles
Related Content
Further Reading
More from
Don't Miss
Up Next
Recommended
Trending
Popular
In Case You Missed It
You Might Also Like
Continue Reading
Related Stories
More Stories
Latest News
Editor's Picks
What to Read Next

# Social media and newsletters
Share this article
Follow us on
Connect with us
Join our newsletter
Sign up for updates
Enter your email
Subscribe to our newsletter
Get the latest updates
Don't miss out

# Comment sections
Comments
Discussions
Leave a Reply
Add Your Comment
Reader Comments

# Author biographies
About the Author
Author Bio

# Tags and categories
Tags
Categories
Filed Under

# Legal and footer content
Disclaimer
Copyright
All rights reserved
Privacy Policy
Terms of Use`;

// Listen for keyboard command to extract and copy to clipboard without opening sidebar.
// Alt+E mapped to "extension.extractAndCopy" in manifest.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'extension.extractAndCopy') return;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.id) return;

    // Ensure all required scripts are active on the current tab
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['paragraph-icons.js', 'inpage-notifications.js']
      });
      // Small delay to ensure scripts are fully loaded
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (_) { }

    // Get custom filter patterns from storage, falling back to defaults.
    const { filterPatterns } = await chrome.storage.sync.get('filterPatterns');
    const patterns = filterPatterns || DEFAULT_FILTERS;

    // First inject the content-extractor.js script
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content-extractor.js']
    });

    // Execute the existing content-script extractor in the page context with custom filters
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      args: [patterns],
      func: (customFilters) => {
        // This function is injected into the page and has no access to the background script's scope.
        // All functions and data it needs must be defined here.

        // Set custom filters in window scope for the shared filterMarkdown function
        window.__customFilters = customFilters;

        // Use the shared content extraction logic
        const { extractMainContent } = window.ContentExtractor || {};

        // Extract content using shared logic
        if (typeof extractMainContent === 'function') {
          return extractMainContent();
        } else {
          throw new Error('ContentExtractor.extractMainContent is not available');
        }
      }
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
        // Success: flash green OK + in-page notification
        flashBadge('Done', '#1e8e3e', 2000);
        try {
          await chrome.tabs.sendMessage(activeTab.id, {
            type: 'SHOW_INPAGE_NOTIFICATION',
            data: {
              notificationType: 'success',
              title: 'Content Copied',
              message: 'Saved prompt + extracted content copied to clipboard.',
              duration: 4000
            }
          });
        } catch (e) {
          console.warn('Failed to send success notification:', e);
        }
      } else {
        // Copy failed: flash red ERR + in-page notification
        flashBadge('ERR', '#d93025', 2000);
        try {
          await chrome.tabs.sendMessage(activeTab.id, {
            type: 'SHOW_INPAGE_NOTIFICATION',
            data: {
              notificationType: 'error',
              title: 'Copy Failed',
              message: 'Failed to copy saved prompt + content to clipboard.',
              duration: 4000
            }
          });
        } catch (e) {
          console.warn('Failed to send error notification:', e);
        }
      }
    } else {
      // No content extracted: flash neutral N/A + in-page notification
      flashBadge('N/A', '#5f6368', 1800);
      try {
        await chrome.tabs.sendMessage(activeTab.id, {
          type: 'SHOW_INPAGE_NOTIFICATION',
          data: {
            notificationType: 'warning',
            title: 'No Content Extracted',
            message: 'Could not extract content from this page.',
            duration: 3500
          }
        });
      } catch (e) {
        console.warn('Failed to send warning notification:', e);
      }
    }
  } catch (err) {
    console.error('Command handling failed:', err);
    // Unexpected error: flash red ERR + in-page notification
    flashBadge('ERR', '#d93025', 2200);
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (activeTab && activeTab.id) {
        await chrome.tabs.sendMessage(activeTab.id, {
          type: 'SHOW_INPAGE_NOTIFICATION',
          data: {
            notificationType: 'error',
            title: 'Extraction Error',
            message: 'An error occurred while extracting content: ' + (err.message || String(err)),
            duration: 4500
          }
        });
      }
    } catch (e) {
      console.warn('Failed to send extraction error notification:', e);
    }
  }
});

// Listen for requests from the sidebar to (re)inject the paragraph icon script on demand
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'REQUEST_INJECT_PARAGRAPH_ICONS') {
    (async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab && activeTab.id) {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['paragraph-icons.js']
          });
          sendResponse && sendResponse({ ok: true });
        } else {
          sendResponse && sendResponse({ ok: false, error: 'No active tab' });
        }
      } catch (e) {
        console.warn('Injection request failed:', e);
        sendResponse && sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    // Indicate async response
    return true;
  }

  // Keep listener stub in case other messages are added later; no-op for other types
  return false;
});

// Auto-inject paragraph icons when switching active tab or when a tab is updated (navigated)
chrome.tabs.onActivated.addListener(async () => {
  try {
    await injectParagraphIconsIntoActiveTab();
  } catch (e) {
    // ignore
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    // Inject when page finishes loading main content or on URL change
    if (changeInfo.status === 'complete' || changeInfo.url) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['paragraph-icons.js']
      });
    }
  } catch (e) {
    // ignore per-tab failures
  }
});

// Helper: inject into the current active tab in the current window
async function injectParagraphIconsIntoActiveTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab && activeTab.id) {
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['paragraph-icons.js']
    });
  }
}