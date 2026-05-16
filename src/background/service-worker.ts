/**
 * Redline Background Service Worker
 * Handles keyboard shortcuts and coordinates with content scripts
 */

/**
 * Ensure content script is injected and send toggle message
 */
async function toggleInspection(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECTION' });
    return;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
    } catch (err) {
      console.error('[Redline] Failed to inject content script:', err);
      return;
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 40));
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECTION' });
        return;
      } catch {
        /* content script still booting */
      }
    }
    console.error('[Redline] Toggle message failed after injection');
  }
}

const TOGGLE_COMMANDS = new Set(['toggle-inspection', 'toggle-inspection-alt']);

// Listen for keyboard shortcut command
chrome.commands.onCommand.addListener((command) => {
  if (!TOGGLE_COMMANDS.has(command)) return;

  void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const activeTab = tabs[0];
    if (activeTab?.id) {
      void toggleInspection(activeTab.id);
    }
  });
});

// Listen for browser action click (extension icon) - only fires if no popup
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    void toggleInspection(tab.id);
  }
});

/**
 * Inject content.js into every existing http(s) tab. Used on install/update
 * so the floating bar appears immediately without requiring a page refresh.
 * The content script's own DOM sentinel guards against double-mounting.
 */
async function injectIntoAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
      } catch {
        // Some pages (chrome web store, view-source:, etc.) reject injection.
        // Silently skip — they're out of scope for this extension anyway.
      }
    }),
  );
}

chrome.runtime.onInstalled.addListener((details) => {
  void injectIntoAllTabs();

  // On fresh install, help the user confirm/assign the keyboard shortcut.
  // Chrome's `suggested_key` is a suggestion only — it is silently skipped
  // when another extension already claims the combo or when Chrome's global
  // suggested-shortcut cap is hit. Opening the shortcuts page surfaces that
  // immediately instead of leaving the user wondering why the hotkey is dead.
  if (details.reason === 'install') {
    void chrome.commands.getAll().then((commands) => {
      const anyBound = commands.some((c) => c.shortcut && c.shortcut.length > 0);
      if (!anyBound) {
        void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      }
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, messageSender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    sendResponse({ isActive: false });
    return;
  }

  if (message.type === 'STATE_CHANGED' && messageSender.tab?.id) {
    const isActive = message.isActive;
    chrome.action.setBadgeText({
      text: isActive ? 'ON' : '',
      tabId: messageSender.tab.id,
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#e63946',
      tabId: messageSender.tab.id,
    });
  }

  // Onboarding step 3: open Chrome's per-extension shortcuts page. Content
  // scripts can't navigate to chrome:// URLs themselves, so we proxy through
  // the service worker.
  if (message.type === 'OPEN_SHORTCUTS_PAGE') {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  }
});
