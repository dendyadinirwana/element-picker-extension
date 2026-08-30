const toggleBtn = document.getElementById('toggleBtn');
const snipBtn = document.getElementById('snipBtn');
const btnLabel = document.getElementById('btnLabel');
const statusStateText = document.getElementById('statusStateText');
const versionTag = document.getElementById('versionTag');

// Dynamically reflect manifest version
if (versionTag && chrome.runtime?.getManifest) {
  const manifest = chrome.runtime.getManifest();
  if (manifest?.version) {
    versionTag.textContent = `v${manifest.version}`;
  }
}

let currentTabId = null;

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (chrome.runtime.lastError || !tabs[0]?.id) return;
  currentTabId = tabs[0].id;
  chrome.storage.local.get([`picker_active_${currentTabId}`], (result) => {
    if (chrome.runtime.lastError) return;
    const isActive = Boolean(result[`picker_active_${currentTabId}`]);
    updateUI(isActive);
  });
});

toggleBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'quickToggle' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.success) {
      updateUI(response.newState);
      setTimeout(() => window.close(), 180);
    }
  });
});

snipBtn?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'startAreaSnip' }, () => {
      void chrome.runtime.lastError;
      window.close();
    });
  });
});

function updateUI(isActive) {
  if (isActive) {
    toggleBtn.classList.add('active');
    btnLabel.textContent = 'Picker Active';
    if (statusStateText) statusStateText.textContent = 'ON';
  } else {
    toggleBtn.classList.remove('active');
    btnLabel.textContent = 'Enable Inspector';
    if (statusStateText) statusStateText.textContent = 'OFF';
  }
}
