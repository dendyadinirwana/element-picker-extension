// Element Picker background service worker

// Side Panel behavior: open panel on extension icon click
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  ?.catch((err) => console.warn('sidePanel behavior error:', err));

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    ?.catch(() => {});

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ep-copy-text',
      title: 'Copy element as Text',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'ep-copy-html',
      title: 'Copy element as HTML',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'ep-copy-jsx',
      title: 'Copy element as JSX',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'ep-copy-selector',
      title: 'Copy CSS Selector',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'ep-copy-screenshot',
      title: 'Copy Screenshot to Clipboard',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'ep-save',
      title: 'Save selected element as ZIP',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'ep-separator',
      type: 'separator',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'ep-toggle',
      title: 'Enable Element Picker',
      contexts: ['all']
    });
  });
});

async function getPickerState(tabId) {
  if (!tabId) return false;
  try {
    const result = await chrome.storage.local.get([`picker_active_${tabId}`]);
    return Boolean(result[`picker_active_${tabId}`]);
  } catch {
    return false;
  }
}

async function setPickerState(tabId, state) {
  if (!tabId) return;
  try {
    await chrome.storage.local.set({ [`picker_active_${tabId}`]: Boolean(state) });
  } catch {
    // Ignore storage write error
  }
}

async function syncBadgeAndMenu(tabId) {
  if (!tabId || typeof tabId !== 'number' || tabId < 0) return;
  try {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return;

    const isActive = await getPickerState(tabId);
    
    // Update badge safely
    if (isActive) {
      await chrome.action.setBadgeText({ tabId, text: 'ON' }).catch(() => {});
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#0284c7' }).catch(() => {});
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    }

    // Update context menu
    chrome.contextMenus.update('ep-toggle', {
      title: isActive ? 'Disable Element Picker' : 'Enable Element Picker'
    }, () => void chrome.runtime.lastError);
  } catch {
    // Ignore error if tab is already closed or destroyed
  }
}

function sendPickerMessage(tabId, enabled) {
  if (!tabId) return;
  try {
    // Send to all frames in the tab (top window + nested iframes)
    chrome.tabs.sendMessage(tabId, {
      action: enabled ? 'enablePicker' : 'disablePicker'
    }, () => void chrome.runtime.lastError);
  } catch {
    // Ignore if tab no longer exists
  }
}

async function togglePickerForTab(tabId) {
  if (!tabId) return false;
  try {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return false;

    const isActive = await getPickerState(tabId);
    const newState = !isActive;
    await setPickerState(tabId, newState);
    sendPickerMessage(tabId, newState);
    await syncBadgeAndMenu(tabId);
    return newState;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getInitialState') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ isActive: false });
      return false;
    }
    getPickerState(tabId)
      .then((isActive) => {
        sendResponse({ isActive });
        syncBadgeAndMenu(tabId).catch(() => {});
      })
      .catch(() => {
        sendResponse({ isActive: false });
      });
    return true;
  }

  if (message.action === 'quickToggle') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const tabId = tabs[0]?.id;
        if (!tabId) {
          sendResponse({ success: false, error: 'No active tab' });
          return;
        }
        const newState = await togglePickerForTab(tabId);
        sendResponse({ success: true, newState });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || 'Toggle failed' });
      }
    });
    return true;
  }

  if (message.action === 'togglePickerFromContentShortcut') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false });
      return false;
    }
    togglePickerForTab(tabId)
      .then((newState) => {
        sendResponse({ success: true, newState });
      })
      .catch(() => {
        sendResponse({ success: false });
      });
    return true;
  }

  if (message.action === 'captureTab') {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    
    if (tabId && windowId) {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ dataUrl: null, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ dataUrl });
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab?.windowId) {
          sendResponse({ dataUrl: null, error: 'No active window found' });
          return;
        }
        chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendResponse({ dataUrl: null, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse({ dataUrl });
        });
      });
    }
    return true;
  }

  if (message.action === 'downloadZip') {
    const { pngDataUrl, htmlContent, filename } = message;
    createAndDownloadZip(pngDataUrl, htmlContent, filename)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Tab lifecycle
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url && !tab.url.startsWith('chrome://')) {
    syncBadgeAndMenu(tabId).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  syncBadgeAndMenu(tabId).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    chrome.storage.local.remove([`picker_active_${tabId}`]);
  } catch {
    // Ignore
  }
});

// Commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-picker') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const tabId = tabs[0]?.id;
        if (tabId) {
          await togglePickerForTab(tabId);
        }
      } catch {
        // Ignore
      }
    });
  }
});

// Context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'ep-toggle') {
    togglePickerForTab(tab.id).catch(() => {});
  } else {
    try {
      chrome.tabs.sendMessage(tab.id, {
        action: 'contextMenuAction',
        menuItemId: info.menuItemId
      }, () => void chrome.runtime.lastError);
    } catch {
      // Ignore
    }
  }
});

// ZIP Generator
async function createAndDownloadZip(pngDataUrl, htmlContent, baseName) {
  const pngBlob = pngDataUrl ? await (await fetch(pngDataUrl)).blob() : null;
  const pngBytes = pngBlob ? new Uint8Array(await pngBlob.arrayBuffer()) : null;
  const htmlBytes = new TextEncoder().encode(htmlContent);

  const entries = [
    { name: 'index.html', data: htmlBytes },
    ...(pngBytes ? [{ name: 'preview.png', data: pngBytes }] : [])
  ];

  const zipBytes = buildMinimalZip(entries);
  const zipBlob = new Blob([zipBytes], { type: 'application/zip' });
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onload = () => {
      chrome.downloads.download({
        url: reader.result,
        filename: `element-picker/${baseName}.zip`,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(downloadId);
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(zipBlob);
  });
}

function buildMinimalZip(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const dataBytes = entry.data;
    const crc = computeCrc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    localHeaders.push(lh, dataBytes);

    // Central directory header (46 bytes + name)
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    centralHeaders.push(ch);
    offset += lh.length + dataBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + centralDirSize + 22;
  const out = new Uint8Array(totalLength);
  let pos = 0;

  for (const part of [...localHeaders, ...centralHeaders, eocd]) {
    out.set(part, pos);
    pos += part.length;
  }

  return out;
}

function computeCrc32(bytes) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();
