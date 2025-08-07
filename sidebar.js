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
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      args: [patterns],
      func: (customFilters) => {
        // Store custom filters globally first
        window.__customFilters = customFilters;
        
        // Define the extraction function inline with custom filter support
        function extractMainContent() {
          const mainEl = findMainContentElement();
          const selectionInfo = getSelectionInfo();
          const context = buildContext(selectionInfo);
          const root = selectionInfo.containerEl || mainEl || document.body;
          const chunks = chunkDomToSemanticBlocks(root);
          const include = { heading: true, paragraph: true, list: true, code: true, blockquote: true, table: true };
          const markdown = renderMarkdown(chunks, include, context);
          return { markdown, chunks, context };
        }
        
        function findMainContentElement() {
          let bestElement = null;
          let bestScore = 0;
          const contentSelectors = ['article','main','.content','.post-content','.article-content','.entry-content','#content','.main-content'];
          for (const selector of contentSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              if (isHidden(element)) continue;
              const score = getTextContentLength(element);
              if (score > bestScore) {
                bestScore = score;
                bestElement = element;
              }
            }
            if (bestScore > 1000) break;
          }
          if (bestScore < 500) {
            const paragraphs = document.querySelectorAll('p');
            let bestParagraph = null;
            let bestParagraphScore = 0;
            for (const p of paragraphs) {
              if (isHidden(p)) continue;
              const len = p.textContent.trim().length;
              if (len > bestParagraphScore) { bestParagraphScore = len; bestParagraph = p; }
            }
            if (bestParagraph && bestParagraphScore > 100) {
              let parent = bestParagraph.parentElement;
              let bestParent = parent;
              let bestParentScore = getTextContentLength(parent);
              for (let i = 0; i < 3; i++) {
                if (!parent) break;
                parent = parent.parentElement;
                if (!parent) break;
                const parentScore = getTextContentLength(parent);
                if (parentScore > bestParentScore * 1.2) { bestParent = parent; bestParentScore = parentScore; }
              }
              bestElement = bestParent;
            }
          }
          return bestElement;
        }
        
        function chunkDomToSemanticBlocks(root) {
          const chunks = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                const tag = el.tagName.toLowerCase();
                if (['script','style','nav','header','footer','aside'].includes(tag)) return NodeFilter.FILTER_REJECT;
                if (isHidden(el)) return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          });
          const push = (type, data) => chunks.push({ type, ...data });
          let node;
          while ((node = walker.nextNode())) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            const el = node;
            const tag = el.tagName.toLowerCase();
            if (/^h[1-6]$/.test(tag)) {
              const level = parseInt(tag[1], 10);
              push('heading', { level, text: cleanInline(el.textContent || ''), breadcrumb: getBreadcrumb(el) });
              continue;
            }
            if (tag === 'pre') {
              const codeEl = el.querySelector('code') || el;
              const codeText = getCodeText(codeEl);
              const lang = detectCodeLanguage(codeEl);
              if (codeText.trim()) push('code', { lang, code: codeText });
              continue;
            }
            if (tag === 'blockquote') {
              const text = cleanInline(el.innerText || '');
              if (text) push('blockquote', { text });
              continue;
            }
            if (tag === 'ul' || tag === 'ol') {
              const ordered = tag === 'ol';
              const items = Array.from(el.querySelectorAll(':scope > li')).map(li => cleanInline(li.innerText || '').trim()).filter(Boolean);
              if (items.length) push('list', { ordered, items });
              continue;
            }
            if (tag === 'table') {
              const rows = Array.from(el.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(td => cleanInline(td.innerText || '').trim()));
              if (rows.length) push('table', { rows });
              continue;
            }
            if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
              if (hasBlockChildren(el)) continue;
              const text = cleanInline(el.innerText || '').trim();
              if (text) push('paragraph', { text });
              continue;
            }
          }
          return chunks;
        }
        
        function hasBlockChildren(el) {
          const blockTags = new Set(['P','DIV','SECTION','ARTICLE','UL','OL','TABLE','PRE','BLOCKQUOTE','H1','H2','H3','H4','H5','H6']);
          for (const child of el.children) {
            if (blockTags.has(child.tagName)) return true;
          }
          return false;
        }
        
        function getCodeText(codeEl) {
          return (codeEl.textContent || '').replace(/\s+$/g, '');
        }
        
        function detectCodeLanguage(codeEl) {
          if (!(codeEl instanceof Element)) return '';
          const classAttr = codeEl.getAttribute('class') || '';
          const match = classAttr.match(/(?:language|lang)-([a-z0-9+#]+)/i) || classAttr.match(/\b([a-z0-9+#]+)\b/i);
          return match ? match[1].toLowerCase() : '';
        }
        
        function cleanInline(text) {
          if (!text) return '';
          let t = text.replace(/\r/g, '').replace(/\t/g, ' ');
          t = t.replace(/\n{3,}/g, '\n\n');
          t = t.split('\n').map(l => l.replace(/\s+$/,'')).join('\n');
          t = t.replace(/[ \u00A0]{2,}/g, ' ');
          return t.trim();
        }
        
        function getBreadcrumb(el) {
          const crumbs = [];
          let cur = el;
          while (cur && cur !== document.body) {
            cur = cur.parentElement;
            if (!cur) break;
            const tag = cur.tagName.toLowerCase();
            if (/^h[1-6]$/.test(tag)) {
              const level = parseInt(tag[1], 10);
              const text = cleanInline(cur.textContent || '');
              if (text) crumbs.unshift(`H${level}:${text}`);
            }
          }
          return crumbs;
        }
        
        function getSelectionInfo() {
          const sel = window.getSelection && window.getSelection();
          if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
            const range = sel.getRangeAt(0);
            const containerEl = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
              ? range.commonAncestorContainer
              : range.commonAncestorContainer.parentElement;
            return {
              hasSelection: true,
              text: sel.toString(),
              startOffset: range.startOffset || 0,
              endOffset: range.endOffset || 0,
              containerEl
            };
          }
          return { hasSelection: false, text: '', startOffset: 0, endOffset: 0, containerEl: null };
        }
        
        function buildContext(selectionInfo) {
          const url = location.href;
          const title = document.title || '';
          const timestamp = new Date().toISOString();
          const topHeadings = Array.from(document.querySelectorAll('h1, h2')).map(h => {
            const level = parseInt(h.tagName[1], 10);
            const text = cleanInline(h.textContent || '');
            return { level, text };
          });
          return { url, title, timestamp, selection: selectionInfo, breadcrumbs: topHeadings };
        }
        
        function renderMarkdown(chunks, include, context) {
          const header = [
            '---',
            `url: ${context.url}`,
            `title: ${context.title}`,
            `timestamp: ${context.timestamp}`,
            context.selection?.hasSelection ? `selection_excerpt: ${truncateInline(context.selection.text, 300)}` : null,
            context.breadcrumbs?.length ? `breadcrumbs: ${context.breadcrumbs.map(b => (b.level === 1 ? '# ' : '## ') + b.text).join(' | ')}` : null,
            '---',
            ''
          ].filter(Boolean).join('\n');
          const lines = [];
          for (const c of chunks) {
            if (c.type === 'heading' && include.heading) {
              lines.push(`${'#'.repeat(Math.min(6, c.level))} ${c.text}`);
            } else if (c.type === 'paragraph' && include.paragraph) {
              lines.push(c.text);
            } else if (c.type === 'list' && include.list) {
              if (c.ordered) {
                c.items.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
              } else {
                c.items.forEach(item => lines.push(`- ${item}`));
              }
            } else if (c.type === 'code' && include.code) {
              const lang = c.lang || '';
              lines.push('```' + lang);
              lines.push(c.code);
              lines.push('```');
            } else if (c.type === 'blockquote' && include.blockquote) {
              c.text.split('\n').forEach(line => lines.push(`> ${line}`));
            } else if (c.type === 'table' && include.table) {
              for (let r = 0; r < c.rows.length; r++) {
                lines.push(`| ${c.rows[r].join(' | ')} |`);
                if (r === 0 && c.rows.length > 1) {
                  lines.push(`| ${c.rows[r].map(() => '---').join(' | ')} |`);
                }
              }
            }
            lines.push('');
          }
          let body = lines.join('\n').trim() + '\n';
          body = filterMarkdown(body, customFilters);
          return `${header}${body}`;
        }
        
        function filterMarkdown(markdown, customFilters) {
          let content = markdown;
          let keywords = [];
          
          if (customFilters) {
            // Parse custom keywords from the textarea input (one keyword per line)
            const lines = customFilters.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
            keywords = lines.map(line => line.trim());
          } else {
            // Use default keywords if no custom filters provided
            keywords = [
              'Read More', 'Read Next', 'Also Read', 'Related Articles', 'Related Content', 
              'Further Reading', 'More from', 'Don\'t Miss', 'Up Next', 'Recommended', 
              'Trending', 'Popular', 'In Case You Missed It', 'You Might Also Like', 
              'Continue Reading', 'Related Stories', 'More Stories', 'Latest News', 
              'Editor\'s Picks', 'What to Read Next', 'Share this article', 'Follow us on', 
              'Connect with us', 'Join our newsletter', 'Sign up for updates', 'Enter your email', 
              'Subscribe to our newsletter', 'Get the latest updates', 'Don\'t miss out', 
              'Comments', 'Discussions', 'Leave a Reply', 'Add Your Comment', 'Reader Comments', 
              'About the Author', 'Author Bio', 'Tags', 'Categories', 'Filed Under', 
              'Disclaimer', 'Copyright', 'All rights reserved', 'Privacy Policy', 'Terms of Use'
            ];
          }
          
          // Convert keywords to regex patterns and apply filtering
          keywords.forEach(keyword => {
            try {
              // Create a pattern that matches headings or sections containing the keyword
              const pattern = `(?:^|\\n{1,2})(?:#{1,3}|\\*\\*)?\\s*(?:${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})[^\\n]*\\s*:?\\s*\\n[\\s\\S]*?(?=(?:\\n\\n|\\n|^)#{1,2} |\\n\\n---\\n|\\n\\n\\*\\*\\*\\n|$)`;
              content = content.replace(new RegExp(pattern, 'gi'), '\n\n');
            } catch (e) {
              console.warn('Invalid filter keyword:', keyword, e);
            }
          });
          
          // Additional cleanup for footers and copyright sections
          const footerPattern = '\\n\\n(?:(?:\\*\\*Note\\*\\*|Disclaimer|Copyright|All rights reserved|Privacy Policy|Terms of Use)|(?:[^\\n]+ © \\d{4})|(?:© \\d{4} [^\\n]+))[\\s\\S]*?$';
          try {
            content = content.replace(new RegExp(footerPattern, 'gi'), '\n');
          } catch (e) {
            console.warn('Invalid footer pattern:', e);
          }
          
          // Remove standalone link lists
          const linkListPattern = '\\n(?:\\s*[-*]\\s*\\[[^\\]]+\\]\\([^)]+\\)\\s*){3,}\\n';
          try {
            content = content.replace(new RegExp(linkListPattern, 'gi'), '\n');
          } catch (e) {
            console.warn('Invalid link list pattern:', e);
          }
          
          // Final cleanup
          content = content.replace(/\\n{3,}/g, '\\n\\n');
          content = content.replace(/(\\n\\s*){2,}/g, '\\n\\n');
          
          return content.trim() + '\\n';
        }
        
        function truncateInline(text, max) {
          const t = (text || '').replace(/\\s+/g, ' ').trim();
          return t.length > max ? t.slice(0, max - 1) + '…' : t;
        }
        
        function isHidden(element) {
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return true;
          return false;
        }
        
        function getTextContentLength(element) {
          if (!element) return 0;
          const clone = element.cloneNode(true);
          const nonContentElements = clone.querySelectorAll('script, style, nav, header, footer, aside');
          for (const el of nonContentElements) {
            if (el.parentNode) el.parentNode.removeChild(el);
          }
          return clone.textContent.trim().length;
        }
        
        return extractMainContent();
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

