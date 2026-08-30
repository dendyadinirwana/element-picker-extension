(() => {
  // ─── State ────────────────────────────────────────────────────────────────
  let isActive = false;
  let hoveredEl = null;
  let selectedEl = null;
  let menuEl = null;
  let overlayEl = null;         // blue hover highlight
  let selectedOverlayEl = null; // orange selected highlight
  let tagLabelEl = null;
  let toastEl = null;
  let toastTimer = null;

  const EP_IDS = new Set(['ep-highlight-overlay', 'ep-selected-overlay', 'ep-tag-label', 'ep-menu', 'ep-toast']);

  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const isMac = /mac/i.test(platform) || /Macintosh|Mac OS X/i.test(navigator.userAgent);
  document.addEventListener('keydown', onGlobalToggleShortcut, true);

  // ─── Safe Runtime Messaging Helper (Guards Context Invalidation) ──────────
  function isExtensionValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function safeSendMessage(message, callback) {
    if (!isExtensionValid()) return;
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err && String(err.message || '').includes('Extension context invalidated')) {
          disablePicker();
          return;
        }
        if (typeof callback === 'function') callback(response, err);
      });
    } catch (e) {
      if (String(e?.message || '').includes('Extension context invalidated')) {
        disablePicker();
      }
    }
  }

  // ─── Auto Sync on Load / Navigation ───────────────────────────────────────
  function syncWithBackground() {
    safeSendMessage({ action: 'getInitialState' }, (response) => {
      if (response?.isActive) {
        enablePicker();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncWithBackground);
  } else {
    syncWithBackground();
  }

  // ─── Init UI elements ─────────────────────────────────────────────────────
  function initOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'ep-highlight-overlay';
    document.documentElement.appendChild(overlayEl);

    selectedOverlayEl = document.createElement('div');
    selectedOverlayEl.id = 'ep-selected-overlay';
    document.documentElement.appendChild(selectedOverlayEl);

    tagLabelEl = document.createElement('div');
    tagLabelEl.id = 'ep-tag-label';
    document.documentElement.appendChild(tagLabelEl);

    toastEl = document.createElement('div');
    toastEl.id = 'ep-toast';
    document.documentElement.appendChild(toastEl);

    window.addEventListener('scroll', onViewportChange, { passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
  }

  function removeOverlay() {
    overlayEl?.remove(); overlayEl = null;
    selectedOverlayEl?.remove(); selectedOverlayEl = null;
    tagLabelEl?.remove(); tagLabelEl = null;
    toastEl?.remove(); toastEl = null;
    window.removeEventListener('scroll', onViewportChange);
    window.removeEventListener('resize', onViewportChange);
  }

  function onViewportChange() {
    if (!isActive) return;
    if (selectedEl) {
      highlightSelected(selectedEl);
    } else if (hoveredEl) {
      highlightHover(hoveredEl);
    }
  }

  // ─── Enable / Disable ─────────────────────────────────────────────────────
  function enablePicker() {
    if (isActive) return;
    isActive = true;
    document.documentElement.classList.add('ep-picker-active');
    initOverlay();
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    showToast('🎯', 'Element Picker aktif');
  }

  function disablePicker() {
    if (!isActive) return;
    isActive = false;
    document.documentElement.classList.remove('ep-picker-active');
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('keydown', onKeyDown, true);
    closeMenu();
    hideHighlight();
    removeOverlay();
    hoveredEl = null;
    selectedEl = null;
  }

  // ─── Element utils ────────────────────────────────────────────────────────
  function isEpElement(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    return EP_IDS.has(el.id) || Boolean(el.closest?.('#ep-menu, #ep-toast, #ep-tag-label, #ep-highlight-overlay, #ep-selected-overlay'));
  }

  function getTargetFromEvent(e) {
    if (typeof e.composedPath === 'function') {
      const path = e.composedPath();
      for (const item of path) {
        if (item instanceof HTMLElement && !isEpElement(item) && item !== document.documentElement && item !== document.body) {
          return item;
        }
      }
    }
    const el = e.target;
    if (el instanceof HTMLElement && !isEpElement(el)) return el;
    return null;
  }

  function getElementLabel(el) {
    if (!el) return '';
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    let cls = '';
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).filter(c => !c.startsWith('ep-')).slice(0, 2);
      if (classes.length) cls = '.' + classes.join('.');
    }
    return `<${tag}${id}${cls}>`;
  }

  function getCssSelector(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      let selector = current.nodeName.toLowerCase();
      if (current.id) {
        selector += `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      } else {
        let sibling = current;
        let nth = 1;
        while (sibling = sibling.previousElementSibling) {
          if (sibling.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  // ─── Computed Style Extraction Helpers ────────────────────────────────────
  function rgbToHex(rgbStr) {
    if (!rgbStr || rgbStr === 'transparent' || rgbStr === 'rgba(0, 0, 0, 0)') {
      return null;
    }
    const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return rgbStr;
    const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function getEffectiveBackgroundColor(el) {
    let curr = el;
    while (curr && curr !== document.documentElement) {
      const bg = window.getComputedStyle(curr).backgroundColor;
      const hex = rgbToHex(bg);
      if (hex) return hex;
      curr = curr.parentElement;
    }
    return '#ffffff';
  }

  function getComputedStylesInfo(el) {
    if (!(el instanceof HTMLElement)) return null;
    const computed = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    // Primary font name & typography
    const rawFont = computed.fontFamily || '';
    const primaryFont = rawFont.split(',')[0].replace(/['"]/g, '').trim() || 'System';
    const fontSize = computed.fontSize || '16px';
    const fontWeight = computed.fontWeight || '400';
    const lineHeight = computed.lineHeight || 'normal';

    // Colors
    const textColorHex = rgbToHex(computed.color) || '#000000';
    const bgHex = rgbToHex(computed.backgroundColor) || getEffectiveBackgroundColor(el);

    // Box model & metrics
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const borderRadius = computed.borderRadius !== '0px' ? computed.borderRadius : '0px';
    const padding = `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`;
    const margin = `${computed.marginTop} ${computed.marginRight} ${computed.marginBottom} ${computed.marginLeft}`;
    const display = computed.display;
    const position = computed.position;
    const border = `${computed.borderWidth} ${computed.borderStyle} ${rgbToHex(computed.borderColor) || computed.borderColor}`;

    return {
      primaryFont,
      fontSize,
      fontWeight,
      lineHeight,
      textColorHex,
      bgHex,
      width,
      height,
      borderRadius,
      padding,
      margin,
      display,
      position,
      border
    };
  }

  // ─── Highlight ────────────────────────────────────────────────────
  function placeOverlay(div, rect) {
    const sx = window.scrollX, sy = window.scrollY;
    div.style.position = 'absolute';
    div.style.left   = `${rect.left + sx}px`;
    div.style.top    = `${rect.top  + sy}px`;
    div.style.width  = `${rect.width}px`;
    div.style.height = `${rect.height}px`;
    div.style.display = 'block';
  }

  function highlightHover(el) {
    if (!overlayEl || !el) return;
    placeOverlay(overlayEl, el.getBoundingClientRect());
    updateTagLabel(el, false);
  }

  function highlightSelected(el) {
    if (!selectedOverlayEl || !el) return;
    placeOverlay(selectedOverlayEl, el.getBoundingClientRect());
    if (overlayEl) overlayEl.style.display = 'none';
    updateTagLabel(el, true);
  }

  function updateTagLabel(el, selected) {
    if (!tagLabelEl) return;
    const rect = el.getBoundingClientRect();
    const label = getElementLabel(el);
    const styles = getComputedStylesInfo(el);

    if (styles) {
      tagLabelEl.innerHTML = `
        <span class="ep-tag-name">${escapeHtml(label)}</span>
        <span class="ep-tag-dim">${styles.width}×${styles.height}</span>
        <span class="ep-tag-font">${escapeHtml(styles.primaryFont)} ${styles.fontSize}</span>
        <span class="ep-tag-colors">
          <span class="ep-swatch-mini" style="background:${styles.textColorHex}" title="Text: ${styles.textColorHex}"></span>
          <span class="ep-swatch-mini" style="background:${styles.bgHex}" title="Bg: ${styles.bgHex}"></span>
        </span>
      `;
    } else {
      tagLabelEl.textContent = label;
    }

    tagLabelEl.className = selected ? 'ep-selected' : '';
    const top = rect.top + window.scrollY - 30;
    tagLabelEl.style.left = `${rect.left + window.scrollX}px`;
    tagLabelEl.style.top  = `${Math.max(top, window.scrollY + 4)}px`;
    tagLabelEl.style.display = 'flex';
  }

  function hideHighlight() {
    if (overlayEl) overlayEl.style.display = 'none';
    if (selectedOverlayEl) selectedOverlayEl.style.display = 'none';
    if (tagLabelEl) tagLabelEl.style.display = 'none';
  }

  function onGlobalToggleShortcut(e) {
    if (e.repeat) return;
    const isXKey = String(e.key || '').toLowerCase() === 'x';
    const isSKey = String(e.key || '').toLowerCase() === 's';
    const isBackquote = e.code === 'Backquote' || e.key === '`' || e.key === '~';

    // Area Snip shortcut: ⌘+Shift+S (Mac) or Ctrl+Shift+S (Win/Linux)
    const macSnipShortcut = isMac && isSKey && e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey;
    const winLinuxSnipShortcut = !isMac && isSKey && e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey;

    if (macSnipShortcut || winLinuxSnipShortcut) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      startAreaSnip();
      return;
    }

    const macShortcut = isMac && (
      (isXKey && e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey) ||
      (isBackquote && e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey)
    );

    const winLinuxShortcut = !isMac &&
      isXKey &&
      e.ctrlKey &&
      e.shiftKey &&
      !e.metaKey &&
      !e.altKey;

    if (!macShortcut && !winLinuxShortcut) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    safeSendMessage({ action: 'togglePickerFromContentShortcut' });
  }

  // ─── Event handlers ───────────────────────────────────────────────────────
  function onMouseOver(e) {
    if (!isActive) return;
    const el = getTargetFromEvent(e);
    if (!el) return;
    hoveredEl = el;
    if (!selectedEl) highlightHover(el);
  }

  function onClick(e) {
    if (!isActive) return;
    const el = getTargetFromEvent(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    selectedEl = el;
    highlightSelected(el);
    showMenu(el, e.clientX, e.clientY);
    notifyElementSelected(el);
  }

  function getBreadcrumbList(el) {
    const list = getBreadcrumbElements(el);
    return list.map((node) => {
      const tag = node.tagName.toLowerCase();
      const id = node.id ? `#${node.id}` : '';
      let cls = '';
      if (node.className && typeof node.className === 'string') {
        const firstCls = node.className.trim().split(/\s+/).filter(c => !c.startsWith('ep-'))[0];
        if (firstCls) cls = '.' + firstCls;
      }
      return {
        label: `${tag}${id}${cls}`,
        tag,
        isCurrent: node === el
      };
    });
  }

  function notifyElementSelected(el) {
    if (!el) {
      safeSendMessage({ action: 'elementDeselected' });
      return;
    }
    const label = getElementLabel(el);
    const styles = getComputedStylesInfo(el);
    const breadcrumbs = getBreadcrumbList(el);
    const hasParent = Boolean(el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement);
    const hasChildren = Boolean([...el.children].filter(c => !isEpElement(c)).length > 0);

    safeSendMessage({
      action: 'elementSelected',
      data: {
        hasSelection: true,
        label,
        styles,
        breadcrumbs,
        hasParent,
        hasChildren
      }
    });
  }

  function onContextMenu(e) {
    if (!isActive) return;
    const el = getTargetFromEvent(e);
    if (!el) return;
    hoveredEl = el;
    if (!selectedEl) highlightHover(el);
  }

  function onKeyDown(e) {
    if (!isActive) return;
    const target = selectedEl || hoveredEl;
    if (!target) return;

    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      const parent = target.parentElement;
      if (parent && parent !== document.body && parent !== document.documentElement) {
        selectedEl = parent;
        hoveredEl = parent;
        if (menuEl) { highlightSelected(parent); refreshMenu(parent); }
        else highlightHover(parent);
      }
    }

    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      const firstChild = [...target.children].find(c => !isEpElement(c));
      if (firstChild) {
        selectedEl = firstChild;
        hoveredEl = firstChild;
        if (menuEl) { highlightSelected(firstChild); refreshMenu(firstChild); }
        else highlightHover(firstChild);
      }
    }

    if (e.key === 'Escape') {
      closeMenu();
      selectedEl = null;
      if (selectedOverlayEl) selectedOverlayEl.style.display = 'none';
      if (hoveredEl) highlightHover(hoveredEl);
      else hideHighlight();
    }
  }

  // ─── Hierarchy Breadcrumbs Helper ─────────────────────────────────────────
  function getBreadcrumbElements(el) {
    const list = [];
    let curr = el;
    while (curr && curr !== document.documentElement && curr !== document.body && !isEpElement(curr)) {
      list.unshift(curr);
      curr = curr.parentElement;
    }
    return list;
  }

  // ─── Menu ─────────────────────────────────────────────────────────────────
  function showMenu(el, clientX, clientY) {
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.id = 'ep-menu';

    const breadcrumbs = getBreadcrumbElements(el);
    const breadcrumbHtml = breadcrumbs.map((node, idx) => {
      const isCurr = node === el;
      const tag = node.tagName.toLowerCase();
      const id = node.id ? `#${node.id}` : '';
      let cls = '';
      if (node.className && typeof node.className === 'string') {
        const firstCls = node.className.trim().split(/\s+/).filter(c => !c.startsWith('ep-'))[0];
        if (firstCls) cls = '.' + firstCls;
      }
      const label = `${tag}${id}${cls}`;
      return `<button class="ep-crumb-btn ${isCurr ? 'active' : ''}" data-crumb-index="${idx}">${escapeHtml(label)}</button>`;
    }).join('<span class="ep-crumb-sep">›</span>');

    const hasParent = el.parentElement &&
      el.parentElement !== document.body &&
      el.parentElement !== document.documentElement;
    const hasChildren = [...el.children].filter(c => !isEpElement(c)).length > 0;

    const styles = getComputedStylesInfo(el);

    menuEl.innerHTML = `
      <div class="ep-menu-header">
        <div class="ep-breadcrumbs-bar">${breadcrumbHtml}</div>
        <div class="ep-menu-nav">
          <button class="ep-nav-btn" id="ep-nav-parent" ${!hasParent ? 'disabled' : ''}>
            <span>↑</span> Parent
          </button>
          <button class="ep-nav-btn" id="ep-nav-child" ${!hasChildren ? 'disabled' : ''}>
            <span>↓</span> Child
          </button>
        </div>
      </div>

      ${styles ? `
      <div class="ep-styles-card">
        <!-- Row 1: Font Family & Size (Full Width) -->
        <div class="ep-style-row">
          <div class="ep-style-item ep-style-full" title="Click to copy font">
            <span class="ep-style-label">Font</span>
            <button class="ep-badge-btn" id="ep-copy-font" style="max-width: 190px;" title="Copy font family">
              ${escapeHtml(styles.primaryFont)} (${styles.fontSize} / ${styles.fontWeight})
            </button>
          </div>
        </div>
        <!-- Row 2: Dimensions & Text Color -->
        <div class="ep-style-row">
          <div class="ep-style-item" title="Element Dimensions">
            <span class="ep-style-label">Size</span>
            <span class="ep-badge-static">${styles.width}×${styles.height}</span>
          </div>
          <div class="ep-style-item" title="Click to copy text color">
            <span class="ep-style-label">Color</span>
            <button class="ep-badge-btn" id="ep-copy-textcolor">
              <span class="ep-color-swatch" style="background:${styles.textColorHex}"></span>
              <span>${styles.textColorHex}</span>
            </button>
          </div>
        </div>
        <!-- Row 3: Background & Radius -->
        <div class="ep-style-row">
          <div class="ep-style-item" title="Click to copy background color">
            <span class="ep-style-label">Bg</span>
            <button class="ep-badge-btn" id="ep-copy-bgcolor">
              <span class="ep-color-swatch" style="background:${styles.bgHex}"></span>
              <span>${styles.bgHex}</span>
            </button>
          </div>
          <div class="ep-style-item" title="Border Radius">
            <span class="ep-style-label">Radius</span>
            <span class="ep-badge-static">${styles.borderRadius || '0px'}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="ep-menu-list">
        <button class="ep-menu-item ep-copy-html">
          <div class="ep-icon">&lt;/&gt;</div><span>HTML</span>
        </button>
        <button class="ep-menu-item ep-copy-jsx">
          <div class="ep-icon">⚛</div><span>JSX</span>
        </button>
        <button class="ep-menu-item ep-copy-screenshot">
          <div class="ep-icon">📷</div><span>PNG Image</span>
        </button>
        <button class="ep-menu-item ep-snip-area">
          <div class="ep-icon">✂️</div><span>Area Snip</span>
        </button>
        <button class="ep-menu-item ep-copy-styles">
          <div class="ep-icon">🎨</div><span>CSS Rules</span>
        </button>
        <button class="ep-menu-item ep-copy-selector">
          <div class="ep-icon">#</div><span>Selector</span>
        </button>
        <button class="ep-menu-item ep-copy-text">
          <div class="ep-icon">T</div><span>Text</span>
        </button>
        <button class="ep-menu-item ep-save">
          <div class="ep-icon">📦</div><span>Export ZIP</span>
        </button>
      </div>
      <button class="ep-menu-close">✕ Close (Esc)</button>
    `;

    document.documentElement.appendChild(menuEl);
    positionMenu(clientX, clientY);

    // Breadcrumb clicks
    menuEl.querySelectorAll('.ep-crumb-btn').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-crumb-index'), 10);
        const targetNode = breadcrumbs[idx];
        if (targetNode) {
          selectedEl = targetNode;
          hoveredEl = targetNode;
          highlightSelected(targetNode);
          refreshMenu(targetNode);
        }
      });
    });

    menuEl.querySelector('#ep-nav-parent').addEventListener('click', ev => {
      ev.stopPropagation();
      const parent = selectedEl?.parentElement;
      if (parent && !isEpElement(parent) && parent !== document.documentElement && parent !== document.body) {
        selectedEl = parent; hoveredEl = parent;
        highlightSelected(parent); refreshMenu(parent);
      }
    });

    menuEl.querySelector('#ep-nav-child').addEventListener('click', ev => {
      ev.stopPropagation();
      const child = [...(selectedEl?.children || [])].find(c => !isEpElement(c));
      if (child) {
        selectedEl = child; hoveredEl = child;
        highlightSelected(child); refreshMenu(child);
      }
    });

    // Style badge copy clicks
    if (styles) {
      menuEl.querySelector('#ep-copy-font')?.addEventListener('click', ev => {
        ev.stopPropagation();
        copyToClipboard(styles.primaryFont, `Font '${styles.primaryFont}' copied`);
      });
      menuEl.querySelector('#ep-copy-textcolor')?.addEventListener('click', ev => {
        ev.stopPropagation();
        copyToClipboard(styles.textColorHex, `Color ${styles.textColorHex} copied`);
      });
      menuEl.querySelector('#ep-copy-bgcolor')?.addEventListener('click', ev => {
        ev.stopPropagation();
        copyToClipboard(styles.bgHex, `Bg ${styles.bgHex} copied`);
      });
    }

    menuEl.querySelector('.ep-copy-html').addEventListener('click', ev => {
      ev.stopPropagation(); copyHtml(selectedEl || el);
    });
    menuEl.querySelector('.ep-copy-jsx').addEventListener('click', ev => {
      ev.stopPropagation(); copyJsx(selectedEl || el);
    });
    menuEl.querySelector('.ep-copy-screenshot').addEventListener('click', ev => {
      ev.stopPropagation(); copyScreenshotToClipboard(selectedEl || el);
    });
    menuEl.querySelector('.ep-snip-area').addEventListener('click', ev => {
      ev.stopPropagation();
      closeMenu();
      startAreaSnip();
    });
    menuEl.querySelector('.ep-copy-styles').addEventListener('click', ev => {
      ev.stopPropagation(); copyComputedCssRules(selectedEl || el);
    });
    menuEl.querySelector('.ep-copy-selector').addEventListener('click', ev => {
      ev.stopPropagation(); copySelector(selectedEl || el);
    });
    menuEl.querySelector('.ep-copy-text').addEventListener('click', ev => {
      ev.stopPropagation(); copyText(selectedEl || el);
    });
    menuEl.querySelector('.ep-save').addEventListener('click', ev => {
      ev.stopPropagation(); saveElement(selectedEl || el);
    });
    menuEl.querySelector('.ep-menu-close').addEventListener('click', ev => {
      ev.stopPropagation();
      closeMenu();
      selectedEl = null;
      if (selectedOverlayEl) selectedOverlayEl.style.display = 'none';
      hoveredEl = null;
      hideHighlight();
    });
  }

  function positionMenu(clientX, clientY) {
    if (!menuEl) return;
    const mw = 275, mh = 330;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = clientX + 12, y = clientY + 12;
    if (x + mw > vw - 12) x = clientX - mw - 12;
    if (y + mh > vh - 12) y = clientY - mh - 12;
    x = Math.max(8, x); y = Math.max(8, y);
    menuEl.style.left = `${x + window.scrollX}px`;
    menuEl.style.top  = `${y + window.scrollY}px`;
    menuEl.style.position = 'absolute';
  }

  function refreshMenu(el) {
    const rect = menuEl?.getBoundingClientRect();
    const x = rect ? rect.left : window.innerWidth / 2;
    const y = rect ? rect.top  : window.innerHeight / 2;
    closeMenu();
    showMenu(el, x, y);
  }

  function closeMenu() {
    menuEl?.remove(); menuEl = null;
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function copyToClipboard(text, successMsg) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        showToast('✓', successMsg || 'Copied to clipboard');
        return;
      }
    } catch {
      // Fallback below
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      textarea.remove();
      if (successful) {
        showToast('✓', successMsg || 'Copied to clipboard');
      } else {
        showToast('✕', 'Copy failed');
      }
    } catch {
      showToast('✕', 'Copy failed');
    }
  }

  function copyText(el) {
    const text = (el.innerText || el.textContent || '').trim();
    copyToClipboard(text, 'Text copied to clipboard');
  }

  function copyHtml(el) {
    copyToClipboard(el.outerHTML, 'HTML copied to clipboard');
  }

  function copySelector(el) {
    const selector = getCssSelector(el);
    copyToClipboard(selector, 'CSS Selector copied');
  }

  function copyComputedCssRules(el) {
    const styles = getComputedStylesInfo(el);
    if (!styles) {
      showToast('✕', 'Unable to extract CSS');
      return;
    }
    const cssBlock = `font-family: ${styles.primaryFont}, sans-serif;
font-size: ${styles.fontSize};
font-weight: ${styles.fontWeight};
color: ${styles.textColorHex};
background-color: ${styles.bgHex};
width: ${styles.width}px;
height: ${styles.height}px;
${styles.borderRadius ? `border-radius: ${styles.borderRadius};\n` : ''}`;
    copyToClipboard(cssBlock, 'CSS styles copied to clipboard');
  }

  function htmlToJsx(html) {
    let jsx = html;
    jsx = jsx.replace(/\bclass=(["'][^"']*["'])/g, 'className=$1');
    jsx = jsx.replace(/\bfor=(["'][^"']*["'])/g, 'htmlFor=$1');
    jsx = jsx.replace(/\btabindex=/gi, 'tabIndex=');
    jsx = jsx.replace(/\bautocomplete=/gi, 'autoComplete=');
    jsx = jsx.replace(/\bautofocus=/gi, 'autoFocus=');
    jsx = jsx.replace(/\breadonly=/gi, 'readOnly=');
    jsx = jsx.replace(/\bmaxlength=/gi, 'maxLength=');
    jsx = jsx.replace(/\bminlength=/gi, 'minLength=');
    jsx = jsx.replace(/\browspan=/gi, 'rowSpan=');
    jsx = jsx.replace(/\bcolspan=/gi, 'colSpan=');
    jsx = jsx.replace(/\bsrcset=/gi, 'srcSet=');
    jsx = jsx.replace(/\bspellcheck=/gi, 'spellCheck=');
    jsx = jsx.replace(/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)([^>]*?)(\/?)>/gi, (match, tag, attrs, slash) => {
      if (slash === '/') return match;
      return `<${tag}${attrs} />`;
    });
    return jsx;
  }

  function copyJsx(el) {
    try {
      const jsx = htmlToJsx(el.outerHTML);
      copyToClipboard(jsx, 'JSX / React copied');
    } catch (e) {
      showToast('✕', 'Failed to generate JSX');
    }
  }

  async function copyScreenshotToClipboard(el) {
    showToast('⏳', 'Capturing screenshot...');
    try {
      const pngDataUrl = await captureElementScreenshot(el);
      const res = await fetch(pngDataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      showToast('✓', 'Screenshot copied to clipboard!');
    } catch (err) {
      showToast('✕', 'Screenshot copy failed');
    }
  }

  async function saveElement(el) {
    showToast('⏳', 'Building ZIP...');

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `ep-${el.tagName.toLowerCase()}-${ts}`;
    const htmlContent = buildStandaloneHtml(el);

    try {
      const pngDataUrl = await captureElementScreenshot(el);
      downloadZip(pngDataUrl, htmlContent, filename, 'ZIP saved successfully');
    } catch (err) {
      downloadZip(createPlaceholderPng(), htmlContent, filename, 'ZIP saved (fallback screenshot)');
    }
  }

  function downloadZip(pngDataUrl, htmlContent, filename, successMessage) {
    safeSendMessage({
      action: 'downloadZip',
      pngDataUrl,
      htmlContent,
      filename
    }, (response, err) => {
      if (err || !response?.success) {
        showToast('✕', 'Save failed');
        return;
      }
      showToast('📦', successMessage || 'ZIP saved');
    });
  }

  // ─── Area Snip / Box Cropper Engine ───────────────────────────────────────
  let isSnipping = false;
  let snipOverlayEl = null;
  let snipBoxEl = null;
  let snipStartX = 0, snipStartY = 0;
  let snipEndX = 0, snipEndY = 0;

  function startAreaSnip() {
    if (isSnipping) return;
    isSnipping = true;
    hideHighlight();
    showToast('✂️', 'Drag & drop area di layar untuk crop/snip (Esc untuk batal)');

    snipOverlayEl = document.createElement('div');
    snipOverlayEl.id = 'ep-snip-overlay';
    
    snipBoxEl = document.createElement('div');
    snipBoxEl.id = 'ep-snip-box';
    snipOverlayEl.appendChild(snipBoxEl);

    document.documentElement.appendChild(snipOverlayEl);

    snipOverlayEl.addEventListener('mousedown', onSnipMouseDown, true);
    window.addEventListener('keydown', onSnipKeyDown, true);
  }

  function stopAreaSnip() {
    if (!isSnipping) return;
    isSnipping = false;
    snipOverlayEl?.remove();
    snipOverlayEl = null;
    snipBoxEl = null;
    window.removeEventListener('mousemove', onSnipMouseMove, true);
    window.removeEventListener('mouseup', onSnipMouseUp, true);
    window.removeEventListener('keydown', onSnipKeyDown, true);
  }

  function onSnipKeyDown(e) {
    if (!isSnipping) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      stopAreaSnip();
      showToast('✕', 'Snip dibatalkan');
    }
  }

  function onSnipMouseDown(e) {
    if (e.button !== 0) return; // only left click
    e.preventDefault();
    e.stopPropagation();
    
    snipStartX = e.clientX;
    snipStartY = e.clientY;
    snipEndX = e.clientX;
    snipEndY = e.clientY;

    updateSnipBox();
    if (snipBoxEl) snipBoxEl.style.display = 'block';

    window.addEventListener('mousemove', onSnipMouseMove, true);
    window.addEventListener('mouseup', onSnipMouseUp, true);
  }

  function onSnipMouseMove(e) {
    if (!isSnipping) return;
    e.preventDefault();
    e.stopPropagation();

    snipEndX = Math.max(0, Math.min(window.innerWidth, e.clientX));
    snipEndY = Math.max(0, Math.min(window.innerHeight, e.clientY));
    updateSnipBox();
  }

  function updateSnipBox() {
    if (!snipBoxEl) return;
    const x = Math.min(snipStartX, snipEndX);
    const y = Math.min(snipStartY, snipEndY);
    const w = Math.abs(snipEndX - snipStartX);
    const h = Math.abs(snipEndY - snipStartY);

    snipBoxEl.style.left = `${x}px`;
    snipBoxEl.style.top = `${y}px`;
    snipBoxEl.style.width = `${w}px`;
    snipBoxEl.style.height = `${h}px`;
    snipBoxEl.setAttribute('data-dimensions', `${w} × ${h}`);
  }

  async function onSnipMouseUp(e) {
    if (!isSnipping) return;
    e.preventDefault();
    e.stopPropagation();

    window.removeEventListener('mousemove', onSnipMouseMove, true);
    window.removeEventListener('mouseup', onSnipMouseUp, true);

    const x = Math.min(snipStartX, snipEndX);
    const y = Math.min(snipStartY, snipEndY);
    const w = Math.abs(snipEndX - snipStartX);
    const h = Math.abs(snipEndY - snipStartY);

    if (w < 4 || h < 4) {
      stopAreaSnip();
      return;
    }

    const cropRect = {
      left: x,
      top: y,
      width: w,
      height: h
    };

    stopAreaSnip();
    showToast('⏳', 'Memproses snip area...');

    try {
      const pngDataUrl = await captureCustomAreaScreenshot(cropRect);
      const res = await fetch(pngDataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      showToast('✓', `Area (${w}×${h}px) disalin ke clipboard!`);
    } catch (err) {
      showToast('✕', 'Gagal memproses crop area');
    }
  }

  async function captureCustomAreaScreenshot(cropRect) {
    const epEls = document.querySelectorAll('#ep-highlight-overlay, #ep-selected-overlay, #ep-tag-label, #ep-menu, #ep-toast, #ep-snip-overlay');
    epEls.forEach(e => e.style.visibility = 'hidden');

    return new Promise((resolve, reject) => {
      safeSendMessage({ action: 'captureTab' }, (response, err) => {
        epEls.forEach(e => e.style.visibility = '');

        if (err) {
          reject(new Error(err.message));
          return;
        }

        if (!response || !response.dataUrl) {
          reject(new Error(response?.error || 'Capture failed'));
          return;
        }

        drawElementCrop(response.dataUrl, cropRect)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  // ─── Screenshot: crop parent rect ─────────────────────────────────────────
  async function captureElementScreenshot(el) {
    const cropRect = getVisibleCropRect(el.getBoundingClientRect());
    if (cropRect.width < 1 || cropRect.height < 1) {
      throw new Error('Selected element is not visible');
    }

    const epEls = document.querySelectorAll('#ep-highlight-overlay, #ep-selected-overlay, #ep-tag-label, #ep-menu, #ep-toast');
    epEls.forEach(e => e.style.visibility = 'hidden');

    return new Promise((resolve, reject) => {
      safeSendMessage({ action: 'captureTab' }, (response, err) => {
        epEls.forEach(e => e.style.visibility = '');

        if (err) {
          reject(new Error(err.message));
          return;
        }

        if (!response || !response.dataUrl) {
          reject(new Error(response?.error || 'Capture failed'));
          return;
        }

        drawElementCrop(response.dataUrl, cropRect)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  function getVisibleCropRect(rect) {
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(window.innerWidth, rect.right);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    return {
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top)
    };
  }

  async function drawElementCrop(dataUrl, cropRect) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scaleX = img.naturalWidth / window.innerWidth;
        const scaleY = img.naturalHeight / window.innerHeight;
        const sourceX = Math.round(cropRect.left * scaleX);
        const sourceY = Math.round(cropRect.top * scaleY);
        const sourceW = Math.max(1, Math.round(cropRect.width * scaleX));
        const sourceH = Math.max(1, Math.round(cropRect.height * scaleY));

        const canvas = document.createElement('canvas');
        canvas.width = sourceW;
        canvas.height = sourceH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // ─── Robust HTML Export Engine ────────────────────────────────────────────
  function extractHeadAssets() {
    let headHtml = '';
    
    // 1. External stylesheets & fonts (convert href/src to absolute URL so it renders properly offline)
    document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], link[rel="preload"][as="style"], link[rel="preload"][as="font"]').forEach(link => {
      const clone = link.cloneNode(true);
      if (link.href) clone.setAttribute('href', link.href);
      headHtml += `  ${clone.outerHTML}\n`;
    });

    // 2. Existing inline style blocks (filter out ep- extension styles)
    document.querySelectorAll('style').forEach(style => {
      if (style.id && style.id.startsWith('ep-')) return;
      if (style.textContent && !style.textContent.includes('#ep-highlight-overlay')) {
        headHtml += `  ${style.outerHTML}\n`;
      }
    });

    return headHtml;
  }

  function extractDocumentThemeInfo() {
    const htmlClasses = document.documentElement.className || '';
    const bodyClasses = document.body.className || '';
    const htmlStyle = document.documentElement.getAttribute('style') || '';
    const bodyStyle = document.body.getAttribute('style') || '';
    
    return { htmlClasses, bodyClasses, htmlStyle, bodyStyle };
  }

  function getAllPageStylesSafe() {
    let css = '';
    [...document.styleSheets].forEach(sheet => {
      try {
        [...(sheet.cssRules || [])].forEach(rule => {
          if (rule.cssText && !rule.cssText.startsWith('#ep-') && !rule.cssText.startsWith('.ep-')) {
            css += rule.cssText + '\n';
          }
        });
      } catch (e) {
        // Cross-origin stylesheet rules blocked by browser security
      }
    });
    return css;
  }

  function buildStandaloneHtml(el) {
    const headAssets = extractHeadAssets();
    const internalStyles = getAllPageStylesSafe();
    const { htmlClasses, bodyClasses, htmlStyle, bodyStyle } = extractDocumentThemeInfo();

    // Deep clone element and resolve relative img src / picture source to absolute URLs
    const clone = el.cloneNode(true);
    clone.querySelectorAll('img').forEach(img => {
      if (img.src) img.setAttribute('src', img.src);
      if (img.srcset) img.setAttribute('srcset', img.srcset);
    });
    clone.querySelectorAll('source').forEach(src => {
      if (src.srcset) src.setAttribute('srcset', src.srcset);
      if (src.src) src.setAttribute('src', src.src);
    });
    clone.querySelectorAll('a').forEach(a => {
      if (a.href) a.setAttribute('href', a.href);
    });
    const exportedOuterHtml = clone.outerHTML;

    return `<!DOCTYPE html>
<html lang="en" class="${escapeHtml(htmlClasses)}" style="${escapeHtml(htmlStyle)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Captured: ${escapeHtml(getElementLabel(el))}</title>
${headAssets}
  <style>
    /* Captured Styles */
${internalStyles}
    /* Element Picker Preview Container */
    body {
      margin: 0;
      padding: 32px;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .ep-captured-root {
      display: inline-block;
      max-width: 100%;
    }
  </style>
</head>
<body class="${escapeHtml(bodyClasses)}" style="${escapeHtml(bodyStyle)}">
  <div class="ep-captured-root">
${exportedOuterHtml}
  </div>
  <script>
    console.log('Captured Element: ${escapeHtml(getElementLabel(el))}');
    console.log('Source URL: ${window.location.href}');
    console.log('Timestamp: ${new Date().toISOString()}');
  <\/script>
</body>
</html>`;
  }

  function createPlaceholderPng() {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 400, 200);
    ctx.strokeStyle = '#e2e8f0'; ctx.strokeRect(0.5, 0.5, 399, 199);
    ctx.fillStyle = '#64748b'; ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Screenshot unavailable', 200, 105);
    return c.toDataURL('image/png');
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  function showToast(icon, message) {
    if (!toastEl) return;
    toastEl.innerHTML = `<span class="ep-toast-icon">${icon}</span><span>${escapeHtml(message)}</span>`;
    toastEl.classList.add('ep-toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl?.classList.remove('ep-toast-show'), 2400);
  }

  // ─── Utils ────────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Message listener ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'enablePicker') {
      enablePicker();
    } else if (message.action === 'disablePicker') {
      disablePicker();
    } else if (message.action === 'startAreaSnip') {
      startAreaSnip();
    } else if (message.action === 'getSelectedElementInfo') {
      const target = selectedEl || hoveredEl;
      if (target) {
        sendResponse({
          hasSelection: true,
          label: getElementLabel(target),
          styles: getComputedStylesInfo(target),
          breadcrumbs: getBreadcrumbList(target),
          hasParent: Boolean(target.parentElement && target.parentElement !== document.body && target.parentElement !== document.documentElement),
          hasChildren: Boolean([...target.children].filter(c => !isEpElement(c)).length > 0)
        });
      } else {
        sendResponse({ hasSelection: false });
      }
      return true;
    } else if (message.action === 'selectBreadcrumbIndex') {
      const target = selectedEl || hoveredEl;
      if (target) {
        const list = getBreadcrumbElements(target);
        const node = list[message.index];
        if (node) {
          selectedEl = node;
          hoveredEl = node;
          highlightSelected(node);
          if (menuEl) refreshMenu(node);
          notifyElementSelected(node);
        }
      }
    } else if (message.action === 'selectNav') {
      const target = selectedEl || hoveredEl;
      if (target) {
        if (message.direction === 'parent') {
          const parent = target.parentElement;
          if (parent && !isEpElement(parent) && parent !== document.documentElement && parent !== document.body) {
            selectedEl = parent;
            hoveredEl = parent;
            highlightSelected(parent);
            if (menuEl) refreshMenu(parent);
            notifyElementSelected(parent);
          }
        } else if (message.direction === 'child') {
          const child = [...target.children].find(c => !isEpElement(c));
          if (child) {
            selectedEl = child;
            hoveredEl = child;
            highlightSelected(child);
            if (menuEl) refreshMenu(child);
            notifyElementSelected(child);
          }
        }
      }
    } else if (message.action === 'contextMenuAction') {
      const target = selectedEl || hoveredEl;
      if (!target) return;
      if (message.menuItemId === 'ep-copy-text') copyText(target);
      else if (message.menuItemId === 'ep-copy-html') copyHtml(target);
      else if (message.menuItemId === 'ep-copy-jsx') copyJsx(target);
      else if (message.menuItemId === 'ep-copy-selector') copySelector(target);
      else if (message.menuItemId === 'ep-copy-styles') copyComputedCssRules(target);
      else if (message.menuItemId === 'ep-copy-screenshot') copyScreenshotToClipboard(target);
      else if (message.menuItemId === 'ep-save') saveElement(target);
    }
    sendResponse({ ok: true });
    return true;
  });

})();
