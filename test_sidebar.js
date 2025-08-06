// Sidebar script for Copilot Sidebar Extension

// DOM elements
const currentUrlElement = document.getElementById('current-url');
const statusElement = document.getElementById('status');

// Function to parse a URL and extract its components
function parseUrl(url) {
  try {
    const urlObj = new URL(url);
    return {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      pathname: urlObj.pathname,
      search: urlObj.search,
      hash: urlObj.hash,
      origin: urlObj.origin,
      port: urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80')
    };
  } catch (e) {
    console.error('Error parsing URL:', e);
    return null;
  }
}

// Function to update the displayed URL and related information
function updateUrlDisplay(url) {
  if (!url) {
    currentUrlElement.textContent = 'No URL available';
    statusElement.textContent = 'Waiting for tab information...';
    return;
  }
  
  // Update the URL display
  currentUrlElement.textContent = url;
  statusElement.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
  
  // Parse the URL to extract components
  const urlInfo = parseUrl(url);
  
  // If we have URL info, create or update the URL details section
  if (urlInfo) {
    let detailsSection = document.getElementById('url-details');
    
    // If the details section doesn't exist, create it
    if (!detailsSection) {
      const container = document.querySelector('.container');
      
      detailsSection = document.createElement('div');
      detailsSection.id = 'url-details';
      detailsSection.className = 'content-section';
      
      const heading = document.createElement('h2');
      heading.textContent = 'URL Details';
      detailsSection.appendChild(heading);
      
      // Insert after the URL container
      const urlContainer = document.querySelector('.url-container');
      container.insertBefore(detailsSection, urlContainer.nextSibling);
    }
    
    // Update the details content
    detailsSection.innerHTML = `
      <h2>URL Details</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="font-weight: bold; padding: 4px 0;">Protocol:</td>
          <td>${urlInfo.protocol}</td>
        </tr>
        <tr>
          <td style="font-weight: bold; padding: 4px 0;">Hostname:</td>
          <td>${urlInfo.hostname}</td>
        </tr>
        <tr>
          <td style="font-weight: bold; padding: 4px 0;">Path:</td>
          <td>${urlInfo.pathname}</td>
        </tr>
        ${urlInfo.search ? `
        <tr>
          <td style="font-weight: bold; padding: 4px 0;">Query:</td>
          <td>${urlInfo.search}</td>
        </tr>` : ''}
        ${urlInfo.hash ? `
        <tr>
          <td style="font-weight: bold; padding: 4px 0;">Fragment:</td>
          <td>${urlInfo.hash}</td>
        </tr>` : ''}
        <tr>
          <td style="font-weight: bold; padding: 4px 0;">Port:</td>
          <td>${urlInfo.port}</td>
        </tr>
      </table>
    `;
  }
}

// Function to get the current active tab's URL and information
async function getCurrentTabInfo() {
  try {
    // Query for the active tab in the current window
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    
    // If we have an active tab, update the display with its URL
    if (tabs && tabs.length > 0) {
      const activeTab = tabs[0];
      updateUrlDisplay(activeTab.url);
      
      // Update tab title if available
      if (activeTab.title) {
        updateTabTitle(activeTab.title);
      }
    } else {
      updateUrlDisplay('No active tab found');
    }
  } catch (error) {
    console.error('Error getting current tab:', error);
    statusElement.textContent = 'Error: ' + error.message;
  }
}

// Function to update the tab title display
function updateTabTitle(title) {
  let titleElement = document.getElementById('tab-title');
  
  // If the title element doesn't exist, create it
  if (!titleElement) {
    const urlContainer = document.querySelector('.url-container');
    
    const titleLabel = document.createElement('div');
    titleLabel.className = 'url-label';
    titleLabel.style.marginTop = '16px';
    titleLabel.textContent = 'Page Title:';
    
    titleElement = document.createElement('div');
    titleElement.id = 'tab-title';
    titleElement.style.wordBreak = 'break-all';
    titleElement.style.fontSize = '14px';
    titleElement.style.padding = '8px';
    titleElement.style.backgroundColor = '#f0f0f0';
    titleElement.style.borderRadius = '4px';
    titleElement.style.border = '1px solid #ddd';
    
    urlContainer.appendChild(titleLabel);
    urlContainer.appendChild(titleElement);
  }
  
  // Update the title text
  titleElement.textContent = title || 'No title available';
}

// Initial information fetch when the sidebar opens
getCurrentTabInfo();

// Listen for tab activation changes (when user switches tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  // Get the newly activated tab's information
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    updateUrlDisplay(tab.url);
    if (tab.title) {
      updateTabTitle(tab.title);
    }
  });
});

// Listen for tab URL updates (when the URL changes in the current tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only update if this is the active tab
  if (tab.active) {
    // If URL has changed, update it
    if (changeInfo.url) {
      updateUrlDisplay(changeInfo.url);
    }
    
    // If title has changed, update it
    if (changeInfo.title) {
      updateTabTitle(changeInfo.title);
    }
  }
});

// Refresh the information every few seconds to ensure it's current
// This is a backup in case the event listeners miss something
setInterval(getCurrentTabInfo, 5000);