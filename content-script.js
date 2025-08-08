// Content script for extracting main content from webpages with semantic chunking and context metadata

// Use the shared content extraction logic
try {
  const {
    extractMainContent
  } = window.ContentExtractor || {};

  if (typeof extractMainContent === 'function') {
    // Store the result globally and dispatch an event to notify the background script
    const result = extractMainContent();
    window.__lastExtractionResult = result;

    // Dispatch a custom event with the result
    window.dispatchEvent(new CustomEvent('copilotSidebarExtractionDone', { detail: result }));

    // Return result for programmatic execution
    result;
  } else {
    console.error('ContentExtractor.extractMainContent is not available');
  }
} catch (error) {
  console.error('Error executing content extraction:', error);
}