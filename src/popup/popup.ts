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

// Load current tab visibility preference
chrome.storage.local.get({ [FAB_HIDDEN_KEY]: false }, (result) => {
  renderTabToggle(result[FAB_HIDDEN_KEY] === true);
});

// Reflect changes from other contexts
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[FAB_HIDDEN_KEY]) {
    renderTabToggle(changes[FAB_HIDDEN_KEY].newValue === true);
  }
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

// Check current state
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const activeTab = tabs[0];
  if (activeTab?.id) {
    chrome.tabs.sendMessage(activeTab.id, { type: 'GET_STATE' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not loaded yet - that's ok
        return;
      }
      if (response?.isActive) {
        updateButtonState(true);
      }
    });
  }
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
    if (label) label.textContent = 'Activate Inspector';
  }
}
