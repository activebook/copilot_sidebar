// Sidebar script for Copilot Sidebar Extension

// DOM elements
const currentUrlElement = document.getElementById('current-url');
const statusElement = document.getElementById('status');
const promptInputElement = document.getElementById('prompt-input');
const savePromptBtn = document.getElementById('save-prompt');
const extractBtn = document.getElementById('extract-button');
const outputArea = document.getElementById('output-area');
const notificationArea = document.getElementById('notification-area');

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
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content-script.js']
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

// Load the custom prompt from chrome.storage
function loadPrompt() {
  chrome.storage.sync.get('customPrompt', (data) => {
    if (data.customPrompt) {
      promptInputElement.value = data.customPrompt;
    }
  });
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
    navigator.clipboard.writeText(finalPrompt)
      .then(() => showNotification('Full prompt copied to clipboard!'))
      .catch(err => showNotification(`Copied to clipboard may have failed: ${err.message}`, true));
  } else {
    showNotification('No content extracted from the active tab.', true);
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
});

