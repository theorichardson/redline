/**
 * Redline Popup Script
 * Handles popup UI interactions
 */

const activateBtn = document.getElementById('activate-btn') as HTMLButtonElement;
const tabToggleRow = document.getElementById('tab-toggle-row') as HTMLDivElement | null;
const tabToggle = document.getElementById('tab-toggle') as HTMLDivElement | null;

const FAB_HIDDEN_KEY = 'redline-floating-button-hidden';

function renderTabToggle(hidden: boolean): void {
  const visible = !hidden;
  if (tabToggle) tabToggle.classList.toggle('active', visible);
  if (tabToggleRow) tabToggleRow.setAttribute('aria-pressed', String(visible));
}

// Defer all async startup work until after first paint so the popup window
// renders its chrome/styling immediately and doesn't appear to "hang" while
// chrome.* APIs settle. requestAnimationFrame fires after the popup is on
// screen; the user perceives an instant open even though state-syncing is
// still happening in the background a few ms later.
function deferAfterPaint(fn: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

// Reflect changes from other contexts (registered eagerly — listener
// registration is cheap and shouldn't be delayed)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[FAB_HIDDEN_KEY]) {
    renderTabToggle(changes[FAB_HIDDEN_KEY].newValue === true);
  }
});

deferAfterPaint(() => {
  // Load current tab visibility preference
  chrome.storage.local.get({ [FAB_HIDDEN_KEY]: false }, (result) => {
    renderTabToggle(result[FAB_HIDDEN_KEY] === true);
  });
});

async function toggleTabVisibility(): Promise<void> {
  const result = await chrome.storage.local.get({ [FAB_HIDDEN_KEY]: false });
  const currentlyHidden = result[FAB_HIDDEN_KEY] === true;
  const nextHidden = !currentlyHidden;
  await chrome.storage.local.set({ [FAB_HIDDEN_KEY]: nextHidden });
  renderTabToggle(nextHidden);
}

tabToggleRow?.addEventListener('click', () => {
  void toggleTabVisibility();
});

tabToggleRow?.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    void toggleTabVisibility();
  }
});

/**
 * Ensure content script is loaded and toggle inspection
 */
async function activateInspector(tabId: number): Promise<void> {
  try {
    // Try to send message first
    await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECTION' });
  } catch {
    // Content script not loaded, inject it first
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      // Wait for script to initialize, then send message
      await new Promise((resolve) => setTimeout(resolve, 100));
      await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECTION' });
    } catch (err) {
      console.error('[Redline Popup] Failed to inject:', err);
    }
  }
}

// Check current state (deferred so we don't block the popup paint waiting
// for the content script on the active tab to respond)
deferAfterPaint(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.id) return;
    chrome.tabs.sendMessage(activeTab.id, { type: 'GET_STATE' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not loaded on this tab — expected on chrome://,
        // PDF viewer, fresh new tabs, etc. Silently ignore.
        return;
      }
      if (response?.isActive) {
        updateButtonState(true);
      }
    });
  });
});

// Handle activate button click
activateBtn?.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (activeTab?.id) {
    await activateInspector(activeTab.id);
    // Close popup after activating
    window.close();
  }
});

function updateButtonState(isActive: boolean): void {
  const label = document.getElementById('activate-label');
  if (isActive) {
    activateBtn.classList.add('active');
    if (label) label.textContent = 'Inspector Active';
  } else {
    activateBtn.classList.remove('active');
    if (label) label.textContent = 'Activate';
  }
}

/**
 * Render the actual bound shortcut for a command. Chrome's `suggested_key`
 * in the manifest is a suggestion only; the real binding lives in
 * chrome.commands.getAll() and may be empty if Chrome declined to assign it
 * (conflict with another extension, suggested-shortcut cap reached, or user
 * cleared it). Surface that truthfully instead of showing stale ⌥⇧R.
 */
function openShortcutsPage(): void {
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

function renderShortcut(
  containerId: string,
  shortcut: string | undefined,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!shortcut || shortcut.length === 0) {
    container.innerHTML = '';
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'unset-link';
    link.textContent = 'Not set — assign';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openShortcutsPage();
    });
    container.appendChild(link);
    return;
  }

  // Chrome returns shortcuts like "Alt+Shift+R" or "⌥⇧R". Normalize to a
  // single inline glyph string (e.g. "⌥⇧R") to match the simplified menu.
  const parts = shortcut.split('+').map((p) => p.trim()).filter(Boolean);
  const macMap: Record<string, string> = {
    Alt: '⌥',
    Option: '⌥',
    Shift: '⇧',
    Ctrl: '⌃',
    Control: '⌃',
    Command: '⌘',
    MacCtrl: '⌃',
    Meta: '⌘',
  };
  container.textContent = parts.map((p) => macMap[p] ?? p).join('');
}

// Defer shortcut rendering — the popup paints with the static manifest
// suggestion immediately, then we swap to the real binding once Chrome's
// API responds.
deferAfterPaint(() => {
  if (!chrome.commands?.getAll) return;
  void chrome.commands.getAll().then((commands) => {
    const primary = commands.find((c) => c.name === 'toggle-inspection');
    const alt = commands.find((c) => c.name === 'toggle-inspection-alt');
    renderShortcut('shortcut-primary', primary?.shortcut);
    renderShortcut('shortcut-alt', alt?.shortcut);
  });
});

document.getElementById('open-shortcuts')?.addEventListener('click', (e) => {
  e.preventDefault();
  openShortcutsPage();
});
