// Paragraph Icons Content Script
// Scans the active page for visible paragraph-like elements and injects a small 16px icon
// at the top-right of each qualifying paragraph. Clicking the icon copies the paragraph text
// to the clipboard and flips the button into a green check state (no sidebar messaging).
//
// Usage: Inject this script into the active tab via chrome.scripting.executeScript from
// background.js. The script auto-scans on injection and on DOM changes/tab switches.
//
// Design decisions implemented here based on approved spec (updated):
// - Targets: p, blockquote, li
// - Only inject for elements with visible text length >= 100 chars
// - Uses IntersectionObserver to inject on first viewport intersection
// - Uses MutationObserver to handle dynamically added content
// - Absolutely positions a 16px circular icon at top-right of the paragraph
// - Icon visible on hover/focus-within to reduce clutter
// - On click: copy paragraph to clipboard, then show green check icon

(() => {
  if (window.__csbParagraphIconsInitialized) return;
  window.__csbParagraphIconsInitialized = true;

  const NS = 'csb-paragraph-icons';
  const DATA_MARK = 'data-csb-paragraph-mark';
  const DATA_INDEX = 'data-csb-paragraph-index';
  const MIN_LEN = 100;

  // Maintain a counter for paragraph indices (not used for messaging anymore but kept for potential telemetry)
  let paragraphCounter = 0;

  // WeakSet to avoid duplicate processing
  const seen = new WeakSet();

  // Prepare and inject stylesheet once
  injectStyles();

  // Intersection observer to lazily inject icons
  const io = new IntersectionObserver(onIntersect, {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  });

  // Mutation observer to discover new candidate nodes
  const mo = new MutationObserver((mutations) => {
    let needsScan = false;
    for (const m of mutations) {
      if (m.type === 'childList' && (m.addedNodes?.length || m.removedNodes?.length)) {
        needsScan = true;
      }
      if (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')) {
        needsScan = true;
      }
    }
    if (needsScan) {
      debounceScan();
    }
  });

  // Debounced scanning to avoid churn
  let scanTimer = null;
  function debounceScan() {
    if (scanTimer) cancelAnimationFrame(scanTimer);
    scanTimer = requestAnimationFrame(() => {
      scanTimer = null;
      scanAndObserve();
    });
  }

  // Kick off initial scan after DOM is ready enough
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAndObserve, { once: true });
  } else {
    scanAndObserve();
  }

  // Start observing mutations on the whole document
  try {
    mo.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden']
    });
  } catch (_) {}

  // Public-ish cleanup in case we want to disable later
  window.__csbParagraphIconsCleanup = function cleanup() {
    try { io.disconnect(); } catch (_) {}
    try { mo.disconnect(); } catch (_) {}
    // Remove injected icons and marks
    document.querySelectorAll(`.${NS}-btn`).forEach((el) => el.remove());
    document.querySelectorAll(`[${DATA_MARK}]`).forEach((el) => {
      el.removeAttribute(DATA_MARK);
      el.removeAttribute(DATA_INDEX);
      // restore position style if we modified it
      const prev = el.getAttribute(`data-csb-prev-position`);
      if (prev !== null) {
        if (prev === '') el.style.removeProperty('position');
        else el.style.position = prev;
        el.removeAttribute('data-csb-prev-position');
      }
      // restore overflow style if we modified it
      const prevOverflow = el.getAttribute(`data-csb-prev-overflow`);
      if (prevOverflow !== null) {
        if (prevOverflow === '') el.style.removeProperty('overflow');
        else el.style.overflow = prevOverflow;
        el.removeAttribute('data-csb-prev-overflow');
      }
    });
    // Remove style
    const styleEl = document.getElementById(`${NS}-style`);
    if (styleEl) styleEl.remove();
    delete window.__csbParagraphIconsInitialized;
    delete window.__csbParagraphIconsCleanup;
  };

  // Main scan: find candidate elements and observe them for viewport intersection
  function scanAndObserve() {
    const candidates = findCandidates();
    for (const el of candidates) {
      if (seen.has(el)) continue;
      seen.add(el);
      io.observe(el);
    }
  }

  // Candidate selector function
  function findCandidates() {
    // Only target visible paragraph-like elements with sufficient length
    // Include divs whose class starts with or contains "text-module"
    const selector = 'p, blockquote, li, div[class^="text-module"], div[class*=" text-module"]';
    const list = Array.from(document.querySelectorAll(selector));
    const filtered = [];

    for (const el of list) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest(`.${NS}-btn`)) continue; // avoid our own nodes
      if (isHidden(el)) continue;
      // Avoid very small list items like nav menus
      if (el.tagName === 'LI') {
        // Heuristic: skip if nested under nav, header, footer, aside, or menu-like lists
        const skipAnc = el.closest('nav, header, footer, aside, menu, .menu, .nav, .navbar, .breadcrumbs');
        if (skipAnc) continue;
      }
      // Text length check (visible-ish)
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length < MIN_LEN) continue;

      filtered.push(el);
    }

    return filtered;
  }

  // Intersection callback: inject icon when element first becomes visible
  function onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      io.unobserve(el);
      if (el.getAttribute(DATA_MARK) === '1') continue;
      try {
        injectIcon(el);
      } catch (e) {
        // Fail quietly to avoid breaking pages
        // eslint-disable-next-line no-console
        console.debug('CSB injectIcon failed:', e);
      }
    }
  }

  function injectIcon(paragraphEl) {
    if (!(paragraphEl instanceof HTMLElement)) return;
    const idx = paragraphCounter++;
    paragraphEl.setAttribute(DATA_MARK, '1');
    paragraphEl.setAttribute(DATA_INDEX, String(idx));

    // Ensure a positioning context without breaking layout
    const computed = window.getComputedStyle(paragraphEl);
    if (computed.position === 'static') {
      // Remember prior inline position
      const prev = paragraphEl.style.position;
      paragraphEl.setAttribute('data-csb-prev-position', prev);
      paragraphEl.style.position = 'relative';
    }

    // Ensure the icon is not clipped by the paragraph box
    // If overflow is not visible, temporarily set to visible and remember the previous value
    if (computed.overflow !== 'visible') {
      const prevOverflow = paragraphEl.style.overflow;
      paragraphEl.setAttribute('data-csb-prev-overflow', prevOverflow);
      paragraphEl.style.overflow = 'visible';
    }

    // Create button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${NS}-btn`;
    btn.setAttribute('aria-label', 'Copy paragraph to clipboard');
    btn.setAttribute('title', 'Copy paragraph to clipboard');
    btn.dataset.index = String(idx);

    // Default icon (blue) before click - inner white circle, no arrow
    btn.innerHTML = `
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="7" fill="#0505f0" opacity="0.9"/>
        <circle cx="8" cy="8" r="3.2" fill="#e7f283" opacity="1"/>
      </svg>
    `;

    // Position inside paragraph
    paragraphEl.appendChild(btn);

    // Click handler: select, copy, and flip to green check
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      // Select the paragraph text
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(paragraphEl);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.debug('CSB paragraph selection failed:', e);
      }

      const text = (paragraphEl.innerText || '').trim();
      if (!text) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback copy
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } finally { ta.remove(); }
        }
        setGreenCheck(btn);
      } catch (e) {
        // If copy fails, keep original icon but still flash
      }
      flash(btn);
    }, { passive: false });

    // Keyboard accessibility: focus within paragraph should show button
    paragraphEl.addEventListener('focusin', () => btn.classList.add(`${NS}-btn--visible`));
    paragraphEl.addEventListener('focusout', () => btn.classList.remove(`${NS}-btn--visible`));
  }

  function setGreenCheck(btn) {
    btn.classList.add(`${NS}-btn--done`);
    // Replace icon content with a green check
    btn.innerHTML = `
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="7" fill="#1e8e3e"/>
        <path d="M5 8.5l2 2 4-4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
      </svg>
    `;
  }

  function flash(btn) {
    btn.classList.add(`${NS}-btn--flash`);
    setTimeout(() => btn.classList.remove(`${NS}-btn--flash`), 400);
  }

  // Utility: hidden check similar to existing extractor
  function isHidden(element) {
    if (!element || !(element instanceof Element)) return true;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return true;
    // Avoid fixed/sticky utility bars at top/bottom
    if ((style.position === 'fixed' || style.position === 'sticky') && rect.height < 40) return true;
    return false;
  }

  function injectStyles() {
    if (document.getElementById(`${NS}-style`)) return;
    const style = document.createElement('style');
    style.id = `${NS}-style`;
    style.textContent = `
      .${NS}-btn {
        position: absolute;
        top: 0;
        right: 0;
        transform: translate(50%, -50%); /* move into upper-right corner and float out */
        width: 20px; /* clickable area larger than icon for usability */
        height: 20px;
        border-radius: 50%;
        border: none;
        padding: 0;
        margin: 0;
        background: rgba(26,115,232,0.10); /* slightly softer */
        backdrop-filter: saturate(140%) blur(1.5px); /* soften glass effect */
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483646; /* below max but above typical content */
        box-shadow: 0 1px 2px rgba(0,0,0,0.10); /* softer shadow */
        opacity: 0;
        transition: opacity 140ms ease, transform 140ms ease, background-color 140ms ease, background 140ms ease;
        background-repeat: no-repeat;
        background-position: center center;
      }
      .${NS}-btn svg { pointer-events: none; }
      [${DATA_MARK}="1"]:hover > .${NS}-btn,
      .${NS}-btn:hover,
      .${NS}-btn:focus,
      .${NS}-btn.${NS}-btn--visible {
        opacity: 1;
      }
      .${NS}-btn:focus {
        outline: 2px solid rgba(26,115,232,0.45); /* subtler focus ring */
        outline-offset: 2px;
      }
      .${NS}-btn:hover {
        background: rgba(26,115,232,0.14); /* softer hover */
      }
      .${NS}-btn.${NS}-btn--done {
        background: rgba(30,142,62,0.14); /* softer success bg */
      }
      .${NS}-btn.${NS}-btn--flash {
        animation: ${NS}-pulse 0.4s ease;
      }
      @keyframes ${NS}-pulse {
        0% { transform: translate(50%, -50%) scale(1); }
        50% { transform: translate(50%, -50%) scale(1.15); }
        100% { transform: translate(50%, -50%) scale(1); }
      }
    `;
    document.documentElement.appendChild(style);
  }
})();