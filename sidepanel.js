// Element Picker Side Panel Logic (Shadcn / UI-UX Pro Max)

const GITHUB_REPO = 'dendyadinirwana/element-picker-extension';

// UI Elements
const toggleBtn = document.getElementById('toggleBtn');
const snipBtn = document.getElementById('snipBtn');
const btnLabel = document.getElementById('btnLabel');
const statusStateText = document.getElementById('statusStateText');
const statusDot = document.getElementById('statusDot');
const versionTag = document.getElementById('versionTag');

const inspectEmpty = document.getElementById('inspectEmpty');
const inspectContent = document.getElementById('inspectContent');
const inspectTag = document.getElementById('inspectTag');
const valDim = document.getElementById('valDim');
const valLayout = document.getElementById('valLayout');
const valPadding = document.getElementById('valPadding');
const valMargin = document.getElementById('valMargin');
const valBorder = document.getElementById('valBorder');
const valFont = document.getElementById('valFont');
const valTextColor = document.getElementById('valTextColor');
const valBgColor = document.getElementById('valBgColor');
const swatchText = document.getElementById('swatchText');
const txtTextColor = document.getElementById('txtTextColor');
const swatchBg = document.getElementById('swatchBg');
const txtBgColor = document.getElementById('txtBgColor');

// Action buttons (Dedicated Export Section)
const actCopyHtml = document.getElementById('actCopyHtml');
const actCopyJsx = document.getElementById('actCopyJsx');
const actCopyPng = document.getElementById('actCopyPng');
const actCopyCss = document.getElementById('actCopyCss');
const actCopySelector = document.getElementById('actCopySelector');
const actCopyText = document.getElementById('actCopyText');
const actSaveZip = document.getElementById('actSaveZip');

// OTA Elements
const otaBanner = document.getElementById('otaBanner');
const otaNewVerBadge = document.getElementById('otaNewVerBadge');
const otaDesc = document.getElementById('otaDesc');
const btnOtaDownload = document.getElementById('btnOtaDownload');
const btnCheckUpdate = document.getElementById('btnCheckUpdate');
const updateStatusText = document.getElementById('updateStatusText');
const changelogList = document.getElementById('changelogList');

let currentTabId = null;
let currentActiveVersion = '1.8.0';

// Changelog data (Local Fallback & Baseline)
let CHANGELOG_DATA = [
  {
    version: '1.8.3',
    date: '2026-08-30',
    highlights: [
      'Live Dynamic Changelog: Changelog sekarang otomatis sync langsung dari GitHub Releases API secara real-time.',
      'Auto-sync Release Notes: Setiap build/release baru di GitHub otomatis muncul di accordion changelog extension tanpa perlu hardcode.',
      'Hug Content Fix: Section Export & Code Generator, Selected Element, dan card sidebar lainnya kini hug content presisi (fit-content).'
    ]
  },
  {
    version: '1.8.2',
    date: '2026-08-30',
    highlights: [
      'UI Layout Fit-Content: Memperbaiki styling container flexbox agar card Export dan Selected Element fit-content rapat (hug content).',
      'Peningkatan area scrollable sidebar.'
    ]
  },
  {
    version: '1.8.1',
    date: '2026-08-30',
    highlights: [
      'Fix Context Invalidation: Menambahkan safeSendMessage guard agar extension tidak crash saat di-reload di tab aktif.',
      'Auto teardown dan event unbind saat runtime extension invalid.'
    ]
  },
  {
    version: '1.8.0',
    date: '2026-08-30',
    highlights: [
      'Side Panel First: Extension sekarang otomatis membuka sidebar (Side Panel) di sisi kanan browser.',
      'Shadcn UI & UI/UX Pro Max: Token warna modern, kontras tinggi, auto dark/light mode.',
      'Explicit CTA: Tombol utama "Activate picker" dan "Deactivate picker" dengan feedback status instan.',
      'Deep Computed Metrics: Menampilkan detail Box Model, display, position, padding, margin, border, dan typography.',
      'Dedicated Export Section: Bagian terpisah untuk aksi copy Clean HTML, React JSX, PNG, CSS Rules, Selector, dan Standalone ZIP.',
      'Area Snip (Box Cropper): Fitur crop canvas atau sembarang area layar (⌘/Ctrl+Shift+S).',
      'OTA Updates via GitHub: Pengecekan rilis otomatis langsung dari repository dendyadinirwana/element-picker-extension.'
    ]
  },
  {
    version: '1.7.4',
    date: '2026-08-30',
    highlights: [
      'Fitur baru: Area Snip (Box Cropper) untuk memotong elemen canvas / raster grafik ke clipboard.',
      'Global shortcut ⌘/Ctrl+Shift+S untuk instant snip.'
    ]
  },
  {
    version: '1.7.2',
    date: '2026-08-30',
    highlights: [
      'Perbaikan bug breadcrumb undefined pada elemen ber-prefix.',
      'Fallback clipboard untuk non-secure/iframe context.',
      'Peningkatan generator React JSX dengan void tag HTML5 lengkap.'
    ]
  }
];

// Initialize Manifest Version
if (chrome.runtime?.getManifest) {
  const manifest = chrome.runtime.getManifest();
  if (manifest?.version) {
    currentActiveVersion = manifest.version;
    if (versionTag) versionTag.textContent = `v${manifest.version}`;
    if (updateStatusText) updateStatusText.textContent = `v${manifest.version} up to date`;
  }
}

// Render Changelog Accordion
function renderChangelog(data = CHANGELOG_DATA) {
  if (!changelogList) return;
  changelogList.innerHTML = data.map((item, idx) => `
    <div class="changelog-item">
      <div class="changelog-header" data-idx="${idx}">
        <span>v${item.version} <span style="font-weight: 400; color: var(--muted-foreground); font-size: 9px;">(${item.date})</span></span>
        <svg class="chevron-icon" id="chev-${idx}" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" style="transition: transform 0.2s ease; transform: ${idx === 0 ? 'rotate(180deg)' : 'rotate(0deg)'}; color: var(--muted-foreground);">
          <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
        </svg>
      </div>
      <div class="changelog-body" id="cb-${idx}" style="display: ${idx === 0 ? 'flex' : 'none'};">
        ${item.highlights.map(h => `<div>• ${h}</div>`).join('')}
      </div>
    </div>
  `).join('');

  changelogList.querySelectorAll('.changelog-header').forEach(header => {
    header.addEventListener('click', () => {
      const idx = header.getAttribute('data-idx');
      const body = document.getElementById(`cb-${idx}`);
      const chev = document.getElementById(`chev-${idx}`);
      const isVisible = body.style.display === 'flex';
      body.style.display = isVisible ? 'none' : 'flex';
      if (chev) {
        chev.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    });
  });
}

renderChangelog();
fetchGithubReleasesAndChangelog();

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

// Toggle Button (Activate picker / Deactivate picker)
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
    if (btnLabel) btnLabel.textContent = 'Deactivate picker';
    if (statusStateText) statusStateText.textContent = 'ACTIVE';
    if (statusDot) statusDot.style.display = 'inline-block';
  } else {
    toggleBtn?.classList.remove('active');
    if (btnLabel) btnLabel.textContent = 'Activate picker';
    if (statusStateText) statusStateText.textContent = 'OFF';
    if (statusDot) statusDot.style.display = 'none';
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

  const st = data.styles || {};

  if (inspectTag) inspectTag.textContent = data.label || '<element>';
  if (valDim) valDim.textContent = `${st.width || 0} × ${st.height || 0} px`;
  if (valLayout) valLayout.textContent = `${st.display || 'block'} (${st.position || 'static'})`;
  if (valPadding) valPadding.textContent = st.padding || '0px';
  if (valMargin) valMargin.textContent = st.margin || '0px';
  if (valBorder) valBorder.textContent = `${st.border || 'none'} (${st.borderRadius || '0px'})`;

  if (valFont) valFont.textContent = `${st.primaryFont || 'System'} (${st.fontSize || '16px'} / ${st.fontWeight || '400'})`;

  if (txtTextColor) txtTextColor.textContent = st.textColorHex || '#000000';
  if (swatchText) swatchText.style.backgroundColor = st.textColorHex || '#000000';

  if (txtBgColor) txtBgColor.textContent = st.bgHex || '#ffffff';
  if (swatchBg) swatchBg.style.backgroundColor = st.bgHex || '#ffffff';
}

// ─── OTA Updates Checker & Dynamic Changelog Sync ───────────────────────────
async function fetchGithubReleasesAndChangelog() {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10&_t=${Date.now()}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (res.ok) {
      const releases = await res.json();
      if (Array.isArray(releases) && releases.length > 0) {
        const dynamicChangelog = releases.map(rel => {
          const ver = (rel.tag_name || '').replace(/^v/, '');
          const dateStr = rel.published_at ? rel.published_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
          
          let highlights = [];
          if (rel.body) {
            highlights = rel.body
              .split('\n')
              .map(l => l.trim().replace(/^[-*•]\s+/, '').replace(/^###\s+/, '').replace(/^##\s+/, ''))
              .filter(l => l.length > 0 && !l.startsWith('#'));
          }
          if (highlights.length === 0) {
            highlights = [rel.name || `Release v${ver}`];
          }

          return {
            version: ver,
            date: dateStr,
            highlights
          };
        });

        if (dynamicChangelog.length > 0) {
          renderChangelog(dynamicChangelog);
        }
      }
    }
  } catch (err) {
    console.warn('[Element Picker] Gagal fetch GitHub releases changelog:', err);
  }
}

async function checkGithubOTA(isManual = false) {
  if (updateStatusText && isManual) updateStatusText.textContent = 'Memeriksa GitHub...';

  // Also refresh changelog
  fetchGithubReleasesAndChangelog();

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest?_t=${Date.now()}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!res.ok) {
      // Fallback check manifest.json in main branch if no formal release yet
      const rawRes = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/manifest.json?_t=${Date.now()}`);
      if (rawRes.ok) {
        const rawManifest = await rawRes.json();
        handleVersionCheck(rawManifest.version, null, isManual);
        return;
      }
      throw new Error('Gagal mengakses GitHub API');
    }

    const release = await res.json();
    const remoteTag = (release.tag_name || '').replace(/^v/, '');
    handleVersionCheck(remoteTag, release, isManual);
  } catch (err) {
    if (updateStatusText) updateStatusText.textContent = `v${currentActiveVersion} up to date`;
    if (isManual) alert('Tidak dapat terhubung ke GitHub: ' + err.message);
  }
}

function handleVersionCheck(remoteVersion, releaseData, isManual) {
  if (!remoteVersion) return;

  const isNewer = compareVersions(remoteVersion, currentActiveVersion) > 0;
  if (isNewer) {
    if (otaBanner) otaBanner.style.display = 'flex';
    if (otaNewVerBadge) otaNewVerBadge.textContent = `v${remoteVersion}`;
    if (otaDesc) otaDesc.textContent = releaseData?.body || `Versi v${remoteVersion} tersedia dengan perbaikan terbaru.`;
    if (updateStatusText) updateStatusText.textContent = `Update v${remoteVersion} tersedia!`;

    btnOtaDownload.onclick = () => {
      downloadAndReloadUpdate(remoteVersion, releaseData);
    };
  } else {
    if (otaBanner) otaBanner.style.display = 'none';
    if (updateStatusText) updateStatusText.textContent = `v${currentActiveVersion} versi terbaru`;
    if (isManual) {
      alert(`Extension sudah versi terbaru (v${currentActiveVersion}).`);
    }
  }
}

function compareVersions(v1, v2) {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function downloadAndReloadUpdate(version, releaseData) {
  const downloadUrl = releaseData?.assets?.[0]?.browser_download_url || `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`;

  chrome.downloads.download({
    url: downloadUrl,
    filename: `element-picker-v${version}.zip`,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      window.open(`https://github.com/${GITHUB_REPO}/releases/latest`, '_blank');
      return;
    }
    alert(`Update v${version} berhasil diunduh ke folder Downloads! Ekstensi akan otomatis di-reload.`);
    setTimeout(() => {
      chrome.runtime.reload();
    }, 1000);
  });
}

btnCheckUpdate?.addEventListener('click', () => checkGithubOTA(true));

// Auto check OTA on mount
checkGithubOTA(false);

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
