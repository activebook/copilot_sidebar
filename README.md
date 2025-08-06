# Copilot Sidebar

A Chrome extension that enhances your productivity by allowing you to extract web content and build custom prompts for AI models, all from a convenient sidebar.

## Features

- **Dark Mode Interface**: A sleek, modern dark mode UI that is easy on the eyes.
- **Custom Prompts**: Create and save your own custom prompts for any AI model.
- **Content Extraction**: Extract the main content from any webpage with a single click.
- **Clipboard Integration**: Automatically copies the extracted content and your custom prompt to the clipboard.
- **Real-time URL Display**: Always know which page you are working with, with a real-time display of the current URL.

## How It Works

This extension uses Chrome's Side Panel API to provide a powerful and intuitive interface for building prompts for AI models. The sidebar allows you to save a custom prompt, which is then combined with the extracted content of the current webpage. The final prompt is then copied to your clipboard, ready to be pasted into any AI model.

### Chrome APIs Used

The extension uses several Chrome APIs to provide its functionality:

1.  `chrome.tabs.query({ active: true, lastFocusedWindow: true })` - Gets the initial active tab when the sidebar opens.
2.  `chrome.tabs.onActivated.addListener()` - Listens for tab switching events.
3.  `chrome.tabs.onUpdated.addListener()` - Listens for URL changes within the active tab.
4.  `chrome.sidePanel.setOptions()` - Configures the sidebar to be available on all websites.
5.  `chrome.action.onClicked.addListener()` - Opens the sidebar when the extension icon is clicked.
6.  `chrome.storage` - Saves and retrieves the user's custom prompt.
7.  `chrome.scripting.executeScript()` - Executes the content script to extract the main content of the page.

## Installation

### Development Installation

1.  Clone this repository or download the source code.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable "Developer mode" using the toggle in the top-right corner.
4.  Click "Load unpacked" and select the folder containing the extension files.
5.  The extension should now appear in your Chrome toolbar.

## Usage

1.  Click the extension icon in the Chrome toolbar to open the sidebar.
2.  Enter your custom prompt in the "Prompt" text area and click "Save Prompt."
3.  Navigate to the webpage you want to extract content from.
4.  Click the "Extract" button.
5.  The extracted content will be displayed in the text area and the full prompt will be copied to your clipboard.

## Files

-   `manifest.json` - Extension configuration (Manifest V3).
-   `background.js` - Background script that sets up the sidebar.
-   `sidebar.html` - HTML structure for the sidebar.
-   `sidebar.js` - JavaScript that handles all the sidebar's functionality.
-   `content-script.js` - Content script that extracts the main content from webpages.
-   `images/` - Directory containing extension icons.

## Permissions

This extension requires the following permissions:

-   `sidePanel` - To create and manage the sidebar.
-   `tabs` - To access tab information and detect URL changes.
-   `clipboardWrite` - To copy the generated prompt to the clipboard.
-   `scripting` - To execute content scripts for extracting webpage content.
-   `storage` - To save the user's custom prompt.
-   `host_permissions: ["<all_urls>"]` - To access content on all websites for extraction.

## License

MIT
