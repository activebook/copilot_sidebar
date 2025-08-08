// Content Extractor - Common logic for content extraction and filtering
// This module can be imported by both content-script.js and background.js

(function() {
  /**
   * Extract and structure page content for AI consumption.
   * - Identifies a main content container
   * - Performs semantic chunking (headings, paragraphs, lists, code blocks)
   * - Preserves code fences with language tags when detectable
   * - Builds a context metadata header (url, title, timestamp, selection ranges, breadcrumb headings)
   * @returns {{markdown:string, chunks:Array, context:Object}} structured extraction
   */
  function extractMainContent() {
    const mainEl = findMainContentElement();
    const selectionInfo = getSelectionInfo();
    const context = buildContext(selectionInfo);

    // Choose root for parsing: prefer selection container if meaningful, else mainEl, else body
    const root = selectionInfo.containerEl || mainEl || document.body;

    // Build chunks
    const chunks = chunkDomToSemanticBlocks(root);

    // Simple include toggles default: include all chunk types
    const include = { heading: true, paragraph: true, list: true, code: true, blockquote: true, table: true };

    // Compose markdown
    const markdown = renderMarkdown(chunks, include, context);

    return {
      markdown,
      chunks,
      context
    };
  }

  /**
   * Heuristic: find likely main content container
   */
  function findMainContentElement() {
    let bestElement = null;
    let bestScore = 0;
    const contentSelectors = [
      'article','main','.content','.post-content','.article-content','.entry-content','#content','.main-content'
    ];
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
      // fallback: expand from densest paragraph
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
        // Skip hidden or script/style/nav/etc elements
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = /** @type {Element} */(node);
          const tag = el.tagName.toLowerCase();
          if (['script','style','nav','header','footer','aside'].includes(tag)) return NodeFilter.FILTER_REJECT;
          if (isHidden(el)) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    // Helpers to push chunks
    const push = (type, data) => chunks.push({ type, ...data });

    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = /** @type {HTMLElement} */(node);
      const tag = el.tagName.toLowerCase();

      // Headings
      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1], 10);
        push('heading', { level, text: cleanInline(el.textContent || ''), breadcrumb: getBreadcrumb(el) });
        continue;
      }

      // Code blocks (pre/code)
      if (tag === 'pre') {
        const codeEl = el.querySelector('code') || el;
        const codeText = getCodeText(codeEl);
        const lang = detectCodeLanguage(codeEl);
        if (codeText.trim()) push('code', { lang, code: codeText });
        continue;
      }

      // Blockquotes
      if (tag === 'blockquote') {
        const text = cleanInline(el.innerText || '');
        if (text) push('blockquote', { text });
        continue;
      }

      // Lists
      if (tag === 'ul' || tag === 'ol') {
        const ordered = tag === 'ol';
        const items = Array.from(el.querySelectorAll(':scope > li')).map(li => cleanInline(li.innerText || '').trim()).filter(Boolean);
        if (items.length) push('list', { ordered, items });
        continue;
      }

      // Tables (simple)
      if (tag === 'table') {
        const rows = Array.from(el.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(td => cleanInline(td.innerText || '').trim()));
        if (rows.length) push('table', { rows });
        continue;
      }

      // Paragraph-like blocks
      if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
        // Avoid capturing containers that have nested block elements; only capture leaf-ish text
        if (hasBlockChildren(el)) continue;
        const text = cleanInline(el.innerText || '').trim();
        if (text) push('paragraph', { text });
        continue;
      }
    }

    // Merge adjacent paragraphs into single paragraph separated by blank line if desired
    // (Keep simple for now)
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
    // Keep original line breaks; avoid collapsing whitespace
    return (codeEl.textContent || '').replace(/\s+$/g, '');
  }

  function detectCodeLanguage(codeEl) {
    if (!(codeEl instanceof Element)) return '';
    const classAttr = codeEl.getAttribute('class') || '';
    // common patterns: language-js, lang-js, language-typescript, hljs language-python
    const match = classAttr.match(/(?:language|lang)-([a-z0-9+#]+)/i) || classAttr.match(/\b([a-z0-9+#]+)\b/i);
    return match ? match[1].toLowerCase() : '';
  }

  function cleanInline(text) {
    if (!text) return '';
    // Collapse spaces but preserve new lines lightly
    let t = text.replace(/\r/g, '').replace(/\t/g, ' ');
    // Replace 3+ newlines with 2
    t = t.replace(/\n{3,}/g, '\n\n');
    // Trim trailing spaces on lines
    t = t.split('\n').map(l => l.replace(/\s+$/,'')).join('\n');
    // Collapse excessive spaces
    t = t.replace(/[ \u00A0]{2,}/g, ' ');
    return t.trim();
  }

  /**
   * Build breadcrumb (nearest heading ancestors)
   */
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

  /**
   * Selection info: range text and container element
   */
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

  /**
   * Context metadata for grounding the AI
   */
  function buildContext(selectionInfo) {
    const url = location.href;
    const title = document.title || '';
    const timestamp = new Date().toISOString();

    // Top-level headings to serve as breadcrumbs of the page
    const topHeadings = Array.from(document.querySelectorAll('h1, h2')).map(h => {
      const level = parseInt(h.tagName[1], 10);
      const text = cleanInline(h.textContent || '');
      return { level, text };
    });

    return {
      url, title, timestamp,
      selection: selectionInfo,
      breadcrumbs: topHeadings
    };
  }

  /**
   * Render to Markdown with a context header
   */
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
        // Render simple table: header separator after first row
        for (let r = 0; r < c.rows.length; r++) {
          lines.push(`| ${c.rows[r].join(' | ')} |`);
          if (r === 0 && c.rows.length > 1) {
            lines.push(`| ${c.rows[r].map(() => '---').join(' | ')} |`);
          }
        }
      }
      lines.push(''); // blank line between blocks
    }
    let body = lines.join('\n').trim() + '\n';

    // Apply markdown filtering
    const customFilters = window.__customFilters || null;
    body = filterMarkdown(body, customFilters);

    return `${header}${body}`;
  }

  /**
   * Filters out common non-article content from markdown.
   * This function is designed to be robust and handle various patterns
   * found in news articles, blogs, and other web content.
   * @param {string} markdown The raw markdown content.
   * @param {string} customFilters Optional custom filter patterns.
   * @returns {string} The filtered markdown content.
   */
  function filterMarkdown(markdown, customFilters = null) {
    let content = markdown;
    let patterns = [];

    // This is the boundary that separates content blocks we want to remove.
    // It looks for the start of a new major section (H1-H2 heading) or a horizontal rule.
    // IMPORTANT: We intentionally stop scanning at the next sibling H1/H2 (not H3/H4),
    // so that when removing a "##" section we also remove all its nested "###/####" subsections.
    const sectionBoundary = '(?=(?:\\n\\n|\\n|^)#{1,2} |\\n\\n---\\n|\\n\\n\\*\\*\\*\\n|$)';

    if (customFilters) {
      // Parse custom filters from the textarea input
      const lines = customFilters.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
      patterns = lines.map(line => line.trim());
    } else {
      // Use default patterns if no custom filters provided
      patterns = [
        // Recommendation sections (e.g., "Read More", "Related Articles", "Editor's/Editors’ Picks", "Trending in X", "More in X")
        // Allow start-of-string or 1-2 newlines and markups like ### or **, followed by keywords.
        `(?:^|\\n{1,2})(?:#{1,3}|\\*\\*)?\\s*(?:Read More|Read Next|Also Read|Related(?: Articles| Content)?|Further Reading|More\\s+from\\s+[^\\n]+|Don['’]t Miss|Up Next|Recommended|Trending(?:\\s+in\\s+[^\\n]+)?|Popular|In Case You Missed It|You Might Also Like|Continue Reading|Related Stories|More Stories|Latest News|Editor['’]s Picks|What to Read Next)\\s*:?\\s*\\n[\\s\\S]*?` + sectionBoundary,

        // Social media, newsletters, and other calls-to-action
        `(?:^|\\n{1,2})(?:#{1,3}|\\*\\*)?\\s*(?:Share this article|Follow us on|Connect with us|Join our newsletter|Sign up for updates|Enter your email|Subscribe to our newsletter|Get the latest updates|Don['’]t miss out)\\s*[:]?\\s*\\n[\\s\\S]*?` + sectionBoundary,

        // Comment sections
        `(?:^|\\n{1,2})(?:#{1,3}|\\*\\*)?\\s*(?:Comments|Discussions|Leave a Reply|Add Your Comment|Reader Comments)\\s*[:]?\\s*\\n[\\s\\S]*?` + sectionBoundary,

        // Author biographies
        `(?:^|\\n{1,2})(?:#{1,3}|\\*\\*)?\\s*(?:About the Author|Author Bio|By [^\\n]{5,50})\\s*[:]?\\s*\\n(?:[^\\n]+\\n){1,5}` + sectionBoundary,

        // Tags, categories, and other metadata lists
        `(?:^|\\n{1,2})(?:#{1,3}|\\*\\*)?\\s*(?:Tags|Categories|Filed Under)\\s*[:]?\\s*\\n[\\s\\S]*?` + sectionBoundary,

        // Standalone lists of links (often navigation or related content not caught above)
        // This one does not use the sectionBoundary logic.
        `\\n(?:\\s*[-*]\\s*\\[[^\\]]+\\]\\([^)]+\\)\\s*){3,}\\n`,

        // Footers, copyright notices, and legal disclaimers. This is anchored to the end of the document.
        `\\n\\n(?:(?:\\*\\*Note\\*\\*|Disclaimer|Copyright|All rights reserved|Privacy Policy|Terms of Use)|(?:[^\\n]+ © \\d{4})|(?:© \\d{4} [^\\n]+))[\\s\\S]*?$`
      ];
    }

    patterns.forEach(pattern => {
      try {
        content = content.replace(new RegExp(pattern, 'gi'), '\n\n');
      } catch (e) {
        console.warn('Invalid filter pattern:', pattern, e);
      }
    });

    // If we removed a parent "##" recommendation-like heading, also remove any nested "###/####" headings beneath it.
    // We match a "##" removable heading and consume everything up to the next H1/H2 or end-of-file.
    // This guarantees that all nested ###/#### inside the ## block are removed together.
    content = content.replace(
      /(?:^|\n)##\s*(?:Related(?:\s+Content)?|Editor['’]s\s+Picks|Trending(?:\s+in\s+[^\n]+)?|More\s+in\s+[^\n]+|More\s+from\s+[^\n]+|Recommended|Popular)[^\n]*\n[\s\S]*?(?=(?:\n#{1,2}\s|$))/gi,
      '\n'
    );

    // Second pass: remove standalone keyword headings (## or ### etc.) that have no body under them
    // when immediately followed by another heading or end-of-file.
    const standaloneHeading = new RegExp(
      '(?:^|\\n)(?:#{1,4})\\s*(?:' +
        'Related(?:\\s+Content)?' +
        '|Editor[\'’]s\\s+Picks' +
        '|Trending(?:\\s+in\\s+[^\\n]+)?' +
        '|More\\s+in\\s+[^\\n]+' +
        '|More\\s+from\\s+[^\\n]+' +
        '|Recommended' +
        '|Popular' +
      ')\\s*(?=\\n(?:#{1,6}\\s|$))',
      'gi'
    );

    let prev;
    do {
      prev = content;
      content = content.replace(standaloneHeading, '\n');
    } while (content !== prev);

    // Final cleanup to normalize whitespace
    content = content.replace(/\n{3,}/g, '\n\n'); // Collapse excess newlines
    content = content.replace(/(\n\s*){2,}/g, '\n\n'); // Collapse newlines with only whitespace in them

    return content.trim() + '\n';
  }

  function truncateInline(text, max) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }

  /**
   * Checks if an element is hidden via CSS
   */
  function isHidden(element) {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
    // off-screen or collapsed
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return true;
    return false;
  }

  /**
   * Gets the length of text content in an element, excluding scripts and styles
   */
  function getTextContentLength(element) {
    if (!element) return 0;
    const clone = element.cloneNode(true);
    const nonContentElements = clone.querySelectorAll('script, style, nav, header, footer, aside');
    for (const el of nonContentElements) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    return clone.textContent.trim().length;
  }

  // Export functions for use in other modules
  window.ContentExtractor = {
    extractMainContent,
    findMainContentElement,
    chunkDomToSemanticBlocks,
    hasBlockChildren,
    getCodeText,
    detectCodeLanguage,
    cleanInline,
    getBreadcrumb,
    getSelectionInfo,
    buildContext,
    renderMarkdown,
    filterMarkdown,
    truncateInline,
    isHidden,
    getTextContentLength
  };
})();