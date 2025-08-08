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
  // Try to inject paragraph-icons into the currently active tab after install/update
  injectParagraphIconsIntoActiveTab().catch(() => {});
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

    // Ensure paragraph icons script is active on the current tab as part of auto behavior
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['paragraph-icons.js']
      });
    } catch (_) {}

    // Get custom filter patterns
    const { filterPatterns } = await chrome.storage.sync.get('filterPatterns');
    // Ensure we pass a string to the extractor; if unset or empty, send an empty string to use defaults in page logic
    const patterns = (typeof filterPatterns === 'string' && filterPatterns.trim().length > 0) ? filterPatterns : '';
    
    // Execute the existing content-script extractor in the page context with custom filters
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
            return content;
          }
          
          // Convert keywords to regex patterns and apply filtering
          keywords.forEach(keyword => {
            try {
              // Create a pattern that matches headings or sections containing the keyword
              const pattern = `(?:^|\n{1,2})(?:#{1,3}|\*\*)?\s*(?:${keyword.replace(/[.*+?^${}()[\]\\]/g, '\\$&')})[^\n]*\s*:?\s*\n[\s\S]*?(?=(?:\n\n|\n|^)#{1,2} |\n\n---\n|\n\n\*\*\*\n|$)`;
              content = content.replace(new RegExp(pattern, 'gi'), '\n\n');
            } catch (e) {
              console.warn('Invalid filter keyword:', keyword, e);
            }
          });
          
          // Additional cleanup for footers and copyright sections
          const footerPattern = '\n\n(?:(?:\*\*Note\*\*|Disclaimer|Copyright|All rights reserved|Privacy Policy|Terms of Use)|(?:[^\n]+ © \d{4})|(?:© \d{4} [^\n]+))[\s\S]*?';
          try {
            content = content.replace(new RegExp(footerPattern, 'gi'), '\n');
          } catch (e) {
            console.warn('Invalid footer pattern:', e);
          }
          
          // Remove standalone link lists
          const linkListPattern = '\n(?:\s*[-*]\s*\[[^\]]+\]\\([^\]]+\\)\\s*){3,}\n';
          try {
            content = content.replace(new RegExp(linkListPattern, 'gi'), '\n');
          } catch (e) {
            console.warn('Invalid link list pattern:', e);
          }
          
          // Final cleanup
          content = content.replace(/\n{3,}/g, '\n\n');
          content = content.replace(/(\n\s*){2,}/g, '\n\n');
          
          return content.trim() + '\n';
        }
        
        function truncateInline(text, max) {
          const t = (text || '').replace(/\s+/g, ' ').trim();
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