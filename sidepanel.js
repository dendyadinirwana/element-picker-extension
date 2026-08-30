// Element Picker Side Panel Logic (Shadcn / UI-UX Pro Max)

const toggleBtn = document.getElementById('toggleBtn');
const snipBtn = document.getElementById('snipBtn');
const btnLabel = document.getElementById('btnLabel');
const statusStateText = document.getElementById('statusStateText');
const versionTag = document.getElementById('versionTag');

const inspectEmpty = document.getElementById('inspectEmpty');
const inspectContent = document.getElementById('inspectContent');
const inspectTag = document.getElementById('inspectTag');
const valDim = document.getElementById('valDim');
const valFont = document.getElementById('valFont');
const valTextColor = document.getElementById('valTextColor');
const valBgColor = document.getElementById('valBgColor');
const swatchText = document.getElementById('swatchText');
const txtTextColor = document.getElementById('txtTextColor');
const swatchBg = document.getElementById('swatchBg');
const txtBgColor = document.getElementById('txtBgColor');

// Action buttons
const actCopyHtml = document.getElementById('actCopyHtml');
const actCopyJsx = document.getElementById('actCopyJsx');
const actCopyPng = document.getElementById('actCopyPng');
const actCopyCss = document.getElementById('actCopyCss');
const actCopySelector = document.getElementById('actCopySelector');
const actCopyText = document.getElementById('actCopyText');
const actSaveZip = document.getElementById('actSaveZip');

let currentTabId = null;

// Dynamically set manifest version
if (versionTag && chrome.runtime?.getManifest) {
  const manifest = chrome.runtime.getManifest();
  if (manifest?.version) {
    versionTag.textContent = `v${manifest.version}`;
  }
}

// Initialize active tab state
async function initPanel() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tabs[0]?.id) return;
  currentTabId = tabs[0].id;

  const result = await chrome.storage.local.get([`picker_active_${currentTabId}`]).catch(() => ({}));
  const isActive = Boolean(result[`picker_active_${currentTabId}`]);
  updateUI(isActive);

  // Request currently selected element state from tab
  chrome.tabs.sendMessage(currentTabId, { action: 'getSelectedElementInfo' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    if (response.hasSelection) {
      renderElementInfo(response);
    }
  });
}

initPanel();

// Toggle Button
toggleBtn?.addEventListener('click', async () => {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ action: 'quickToggle' }, (response) => {
    if (chrome.runtime.lastError || !response?.success) return;
    updateUI(response.newState);
  });
});

// Area Snip Button
snipBtn?.addEventListener('click', () => {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, { action: 'startAreaSnip' }, () => {
    void chrome.runtime.lastError;
  });
});

// Action Buttons
function sendTabAction(menuItemId) {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, { action: 'contextMenuAction', menuItemId }, () => {
    void chrome.runtime.lastError;
  });
}

actCopyHtml?.addEventListener('click', () => sendTabAction('ep-copy-html'));
actCopyJsx?.addEventListener('click', () => sendTabAction('ep-copy-jsx'));
actCopyPng?.addEventListener('click', () => sendTabAction('ep-copy-screenshot'));
actCopyCss?.addEventListener('click', () => sendTabAction('ep-copy-styles'));
actCopySelector?.addEventListener('click', () => sendTabAction('ep-copy-selector'));
actCopyText?.addEventListener('click', () => sendTabAction('ep-copy-text'));
actSaveZip?.addEventListener('click', () => sendTabAction('ep-save'));

function updateUI(isActive) {
  if (isActive) {
    toggleBtn?.classList.add('active');
    if (btnLabel) btnLabel.textContent = 'Picker Active';
    if (statusStateText) statusStateText.textContent = 'ON';
  } else {
    toggleBtn?.classList.remove('active');
    if (btnLabel) btnLabel.textContent = 'Enable Inspector';
    if (statusStateText) statusStateText.textContent = 'OFF';
  }
}

function renderElementInfo(data) {
  if (!data || !data.hasSelection) {
    if (inspectEmpty) inspectEmpty.style.display = 'block';
    if (inspectContent) inspectContent.style.display = 'none';
    return;
  }

  if (inspectEmpty) inspectEmpty.style.display = 'none';
  if (inspectContent) inspectContent.style.display = 'flex';

  if (inspectTag) inspectTag.textContent = data.label || '<element>';
  if (valDim) valDim.textContent = `${data.styles?.width || 0} × ${data.styles?.height || 0}`;
  if (valFont) valFont.textContent = `${data.styles?.primaryFont || 'System'} ${data.styles?.fontSize || ''}`;

  if (txtTextColor) txtTextColor.textContent = data.styles?.textColorHex || '#000000';
  if (swatchText) swatchText.style.backgroundColor = data.styles?.textColorHex || '#000000';

  if (txtBgColor) txtBgColor.textContent = data.styles?.bgHex || '#ffffff';
  if (swatchBg) swatchBg.style.backgroundColor = data.styles?.bgHex || '#ffffff';
}

// Listen for updates from content script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'elementSelected') {
    renderElementInfo(message.data);
  } else if (message.action === 'elementDeselected') {
    renderElementInfo(null);
  }
});

// Re-init on tab changes
chrome.tabs.onActivated.addListener(({ tabId }) => {
  currentTabId = tabId;
  initPanel();
});
