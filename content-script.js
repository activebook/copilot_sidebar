// Content script for extracting main content from webpages

/**
 * Extracts the main content from the current webpage
 * Uses heuristics to identify the main content area
 * @returns {string} The extracted content
 */
function extractMainContent() {
  // Initialize variables to track the best content candidate
  let bestElement = null;
  let bestScore = 0;
  
  // Elements that are likely to contain the main content
  const contentSelectors = [
    'article',
    'main',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content',
    '.main-content'
  ];
  
  // Try to find content using common selectors first
  for (const selector of contentSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      // Skip hidden elements
      if (isHidden(element)) continue;
      
      const textLength = element.textContent.trim().length;
      if (textLength > bestScore) {
        bestScore = textLength;
        bestElement = element;
      }
    }
    
    // If we found a good candidate, stop searching
    if (bestScore > 1000) break;
  }
  
  // If we didn't find a good candidate using selectors, use heuristics
  if (bestScore < 500) {
    // Get all paragraphs
    const paragraphs = document.querySelectorAll('p');
    
    // Find the paragraph with the most text
    let bestParagraph = null;
    let bestParagraphScore = 0;
    
    for (const p of paragraphs) {
      // Skip hidden paragraphs
      if (isHidden(p)) continue;
      
      const textLength = p.textContent.trim().length;
      if (textLength > bestParagraphScore) {
        bestParagraphScore = textLength;
        bestParagraph = p;
      }
    }
    
    // If we found a good paragraph, use its parent as the content element
    if (bestParagraph && bestParagraphScore > 100) {
      // Find the best parent container by looking for the one with the most text content
      let parent = bestParagraph.parentElement;
      let bestParent = parent;
      let bestParentScore = getTextContentLength(parent);
      
      // Check up to 3 levels of parents
      for (let i = 0; i < 3; i++) {
        if (!parent) break;
        parent = parent.parentElement;
        if (!parent) break;
        
        const parentScore = getTextContentLength(parent);
        if (parentScore > bestParentScore * 1.2) { // Must be significantly better
          bestParent = parent;
          bestParentScore = parentScore;
        }
      }
      
      bestElement = bestParent;
      bestScore = bestParentScore;
    }
  }
  
  // If we found a good content element, extract its text
  if (bestElement && bestScore > 200) {
    return cleanText(bestElement.innerText);
  }
  
  // Fallback: extract text from the entire body, but limit to first 5000 characters
  const bodyText = document.body.innerText;
  return cleanText(bodyText.substring(0, 5000));
}

/**
 * Checks if an element is hidden via CSS
 * @param {Element} element - The element to check
 * @returns {boolean} True if the element is hidden
 */
function isHidden(element) {
  const style = window.getComputedStyle(element);
  return style.display === 'none' || 
         style.visibility === 'hidden' || 
         style.opacity === '0' || 
         element.offsetParent === null;
}

/**
 * Gets the length of text content in an element, excluding scripts and styles
 * @param {Element} element - The element to check
 * @returns {number} The length of text content
 */
function getTextContentLength(element) {
  // Clone the element to avoid modifying the original
  const clone = element.cloneNode(true);
  
  // Remove scripts, styles, and other non-content elements
  const nonContentElements = clone.querySelectorAll('script, style, nav, header, footer, aside');
  for (const el of nonContentElements) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
  
  return clone.textContent.trim().length;
}

/**
 * Cleans up extracted text by removing extra whitespace and limiting length
 * @param {string} text - The text to clean
 * @returns {string} The cleaned text
 */
function cleanText(text) {
  // Replace multiple whitespace characters with a single space
  let cleaned = text.replace(/\s+/g, ' ');
  
  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Return the extracted content
extractMainContent();