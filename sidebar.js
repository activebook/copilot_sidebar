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
    
    if (results && results.length > 0 && results[0].result) {
      return results[0].result;
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
extractBtn.addEventListener('click', async () => {
  clearOldState();
  const extractedContent = await extractPageContent();
  if (extractedContent) {
    const customPrompt = promptInputElement.value;
    const finalPrompt = `${customPrompt}\n\n${extractedContent}`;
    
    navigator.clipboard.writeText(finalPrompt)
      .then(() => {
        outputArea.value = extractedContent;
        showNotification('Full prompt copied to clipboard!');
      })
      .catch(err => {
        showNotification(`Failed to copy prompt: ${err.message}`, true);
      });
  }
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

