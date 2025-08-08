// Sidebar script for Copilot Sidebar Extension

// DOM elements
const currentUrlElement = document.getElementById('current-url');
const statusElement = document.getElementById('status');
const promptInputElement = document.getElementById('prompt-input');
const savePromptBtn = document.getElementById('save-prompt');
const extractBtn = document.getElementById('extract-button');
const outputArea = document.getElementById('output-area');
const notificationArea = document.getElementById('notification-area');
const filterListElement = document.getElementById('filter-list');
const saveFiltersBtn = document.getElementById('save-filters');
const resetFiltersBtn = document.getElementById('reset-filters');

let currentUrl = '';
let currentTitle = '';

// Function to display notifications
function showNotification(message, isError = false) {
  notificationArea.textContent = message;
  notificationArea.className = isError ? 'notification-error' : 'notification-success';
  notificationArea.style.display = 'block';
}

function clearOldState() {
    notificationArea.style.display = 'none';
    outputArea.value = '';
}

// Function to update the displayed URL and related information
function updateUrlDisplay(url, title) {
  if (!url) {
    currentUrlElement.textContent = 'No URL available';
    statusElement.textContent = 'Waiting for tab information...';
    return;
  }
  
  currentUrl = url;
  currentTitle = title;
  currentUrlElement.textContent = url;
  statusElement.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

// Function to extract content from the current webpage
async function extractPageContent() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tabs || tabs.length === 0) {
      showNotification('Error: No active tab found', true);
      return null;
    }
    
    const activeTab = tabs[0];
    
    // Get filter patterns from storage
    const { filterPatterns } = await chrome.storage.sync.get('filterPatterns');
    const patterns = filterPatterns || DEFAULT_FILTERS;
    
    // First inject the content-extractor.js script
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content-extractor.js']
    });
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      args: [patterns],
      func: (customFilters) => {
        // Store custom filters globally first
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
    
    if (results && results.length > 0) {
      const value = results[0].result;
      // Normalize return: prefer structured {markdown, chunks, context}; fallback to string
      if (value && typeof value === 'object' && 'markdown' in value) {
        return value;
      }
      if (typeof value === 'string') {
        return { markdown: value, chunks: [], context: {
          url: activeTab.url || '',
          title: activeTab.title || '',
          timestamp: new Date().toISOString(),
          selection: { hasSelection: false, text: '', startOffset: 0, endOffset: 0 },
          breadcrumbs: []
        }};
      }
    }
    
    return null;
  } catch (error) {
    console.error('Extraction error:', error);
    showNotification(`Error extracting content: ${error.message}`, true);
    return null;
  }
}

// Function to get the current active tab's URL and information
async function getCurrentTabInfo() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    
    if (tabs && tabs.length > 0) {
      const activeTab = tabs[0];
      updateUrlDisplay(activeTab.url, activeTab.title);
    } else {
      updateUrlDisplay('No active tab found');
    }
  }
  catch (error) {
    statusElement.textContent = 'Error: ' + error.message;
  }
}

// Save the custom prompt to chrome.storage
savePromptBtn.addEventListener('click', () => {
  clearOldState();
  const prompt = promptInputElement.value;
  chrome.storage.sync.set({ customPrompt: prompt }, () => {
    showNotification('Prompt saved!');
  });
});

saveFiltersBtn.addEventListener('click', () => {
  clearOldState();
  saveFilters();
});

resetFiltersBtn.addEventListener('click', () => {
  clearOldState();
  resetFilters();
});

// Load the custom prompt from chrome.storage
function loadPrompt() {
  chrome.storage.sync.get('customPrompt', (data) => {
    if (data.customPrompt) {
      promptInputElement.value = data.customPrompt;
    }
  });
}

// Default filter keywords (one per line)
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

// Save filter patterns to chrome.storage
function saveFilters() {
  let filters = (filterListElement.value || '').trim();
  if (!filters) {
    // Coerce to defaults if empty
    filters = DEFAULT_FILTERS;
    filterListElement.value = DEFAULT_FILTERS;
  }
  chrome.storage.sync.set({ filterPatterns: filters }, () => {
    showNotification('Filter patterns saved!');
  });
}

// Load filter patterns from chrome.storage
function loadFilters() {
  chrome.storage.sync.get('filterPatterns', (data) => {
    const saved = typeof data.filterPatterns === 'string' ? data.filterPatterns : '';
    if (saved && saved.trim().length > 0) {
      filterListElement.value = saved;
    } else {
      // Use default filters if none saved or empty
      filterListElement.value = DEFAULT_FILTERS;
    }
  });
}

// Reset filters to default
function resetFilters() {
  filterListElement.value = DEFAULT_FILTERS;
  saveFilters();
}

// Extract content, combine with prompt, and display
async function handleExtractionResult(result) {
  if (result) {
    const { markdown, context } = result;
    const customPrompt = promptInputElement.value || '';
    const finalPrompt = customPrompt ? `${customPrompt}\n\n${markdown}` : markdown;
    outputArea.value = markdown;
    try {
      const title = context?.title || '';
      const url = context?.url || '';
      const ts = context?.timestamp ? new Date(context.timestamp).toLocaleString() : new Date().toLocaleString();
      statusElement.textContent = `Extracted • ${ts}${title ? ` • ${title}` : ''}`;
      currentUrlElement.textContent = url || currentUrlElement.textContent;
    } catch (_) {}
    // Try Clipboard API, fallback to execCommand in sidebar page if needed
    navigator.clipboard.writeText(finalPrompt)
      .then(() => showNotification('Full prompt copied to clipboard!'))
      .catch(err => {
        try {
          const ta = document.createElement('textarea');
          ta.value = finalPrompt;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          if (ok) {
            showNotification('Full prompt copied to clipboard!');
          } else {
            showNotification(`Copy to clipboard failed: ${err && err.message ? err.message : 'unknown error'}`, true);
          }
        } catch (e2) {
          showNotification(`Copy to clipboard failed: ${e2 && e2.message ? e2.message : 'unknown error'}`, true);
        }
      });
  } else {
    showNotification('No content extracted from the active tab.', true);
  }
}

// Handle a single paragraph selection message from page
function handleParagraphSelectedMessage(msg) {
  try {
    const { text, sourceUrl, paragraphIndex } = msg.payload || {};
    if (!text) {
      showNotification('Paragraph selection contained no text.', true);
      return;
    }
    const customPrompt = promptInputElement.value || '';
    const header = `---\nurl: ${sourceUrl || currentUrl}\nselected_paragraph_index: ${typeof paragraphIndex === 'number' ? paragraphIndex : 'n/a'}\n---\n\n`;
    const combined = customPrompt ? `${customPrompt}\n\n${header}${text}` : `${header}${text}`;
    outputArea.value = text;
    statusElement.textContent = `Paragraph captured • ${new Date().toLocaleTimeString()}`;
    navigator.clipboard.writeText(combined)
      .then(() => showNotification('Paragraph sent. Copied combined prompt + text to clipboard.'))
      .catch(err => showNotification(`Paragraph copied may have failed: ${err.message}`, true));
  } catch (e) {
    showNotification(`Failed to handle paragraph: ${e && e.message ? e.message : e}`, true);
  }
}

extractBtn.addEventListener('click', async () => {
  clearOldState();
  const result = await extractPageContent();
  await handleExtractionResult(result);
});

// Initial setup
getCurrentTabInfo();
loadPrompt();
loadFilters();

// Listen for tab activation changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    updateUrlDisplay(tab.url, tab.title);
  });
});

// Listen for tab URL updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.title)) {
    updateUrlDisplay(tab.url, tab.title);
  }
});

// Refresh the information every few seconds
setInterval(getCurrentTabInfo, 5000);

// Listen for background command completion to auto-populate after Alt+E
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg && msg.type === 'OPEN_SIDEBAR_AND_EXTRACT_COMPLETE') {
    // Try to read the last extraction payload stored by background
    try {
      const data = await chrome.storage.local.get('__lastExtraction__');
      const payload = data.__lastExtraction__;
      if (payload) {
        await handleExtractionResult(payload);
        // Optionally clear it
        // await chrome.storage.local.remove('__lastExtraction__');
      } else {
        // Fallback: run extraction from the sidebar itself
        const result = await extractPageContent();
        await handleExtractionResult(result);
      }
    } catch (e) {
      const result = await extractPageContent();
      await handleExtractionResult(result);
    }
  }

  // New: background triggers this after opening the side panel
  if (msg && msg.type === 'TRIGGER_EXTRACTION') {
    try {
      const result = await extractPageContent();
      await handleExtractionResult(result);
    } catch (_) {}
  }
  
  // Handle paragraphSelected messages from the injected page script
  if (msg && msg.type === 'paragraphSelected') {
    handleParagraphSelectedMessage(msg);
  }
});

// On load, request the background to inject the paragraph icon script in the active tab
(async function tryInjectParagraphIcons() {
  try {
    chrome.runtime.sendMessage({ type: 'REQUEST_INJECT_PARAGRAPH_ICONS' });
  } catch (_) {}
})();