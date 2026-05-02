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
    console.log('[Redline] Injecting content script into tab', tabId);
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
});

console.log('[Redline] Service worker initialized');
