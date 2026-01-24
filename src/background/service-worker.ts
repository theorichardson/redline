/**
 * Redline Background Service Worker
 * Handles keyboard shortcuts and coordinates with content scripts
 */

/**
 * Ensure content script is injected and send toggle message
 */
async function toggleInspection(tabId: number): Promise<void> {
  try {
    // Try to send message first
    await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECTION' });
  } catch {
    // Content script not loaded, inject it first
    console.log('[Redline] Injecting content script into tab', tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      // Wait a moment for script to initialize, then send message
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECTION' });
      }, 100);
    } catch (err) {
      console.error('[Redline] Failed to inject content script:', err);
    }
  }
}

// Listen for keyboard shortcut command
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-inspection') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        toggleInspection(activeTab.id);
      }
    });
  }
});

// Listen for browser action click (extension icon) - only fires if no popup
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    toggleInspection(tab.id);
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, messageSender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    sendResponse({ isActive: false });
  }

  // Update badge when inspection state changes
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

  return true;
});

console.log('[Redline] Service worker initialized');
