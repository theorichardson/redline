/**
 * Redline Content Script Entry Point
 * Initializes the element inspector and handles messages from background
 */

import { ElementInspector } from './ElementInspector';
import { FloatingButton } from './FloatingButton';
import type { Message } from '../shared/types';

// Forward declare so inspector can reference it
let floatingButton: FloatingButton;

// Helper to sync state
function syncState(): void {
  const isActive = inspector.getIsActive();
  floatingButton.setActive(isActive);
  chrome.runtime.sendMessage({
    type: 'STATE_CHANGED',
    isActive,
  });
}

// Initialize inspector with callback for when it deactivates itself (e.g., via Escape)
const inspector = new ElementInspector({
  onDeactivate: () => syncState(),
});

// Initialize floating button
floatingButton = new FloatingButton({
  onToggle: () => {
    inspector.toggle();
    syncState();
  },
});

// Mount floating button immediately
floatingButton.mount();

// Expose for debugging
(window as unknown as Record<string, unknown>).__redlineInspector = inspector;
(window as unknown as Record<string, unknown>).__redlineFloatingButton = floatingButton;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_INSPECTION':
      inspector.toggle();
      syncState();
      sendResponse({ success: true });
      break;

    case 'GET_STATE':
      sendResponse({ isActive: inspector.getIsActive() });
      break;
  }

  return true; // Keep channel open
});

// Also listen for keyboard shortcut directly (as backup)
document.addEventListener('keydown', (e) => {
  // Cmd+Shift+L (Mac) or Ctrl+Shift+L (Windows/Linux)
  // Check for both 'L' and 'l' since shift may affect the key value
  const isL = e.key === 'L' || e.key === 'l';
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && isL) {
    e.preventDefault();
    console.log('[Redline] Keyboard shortcut detected, toggling...');
    inspector.toggle();
    syncState();
  }
});

console.log('[Redline] Content script loaded. Click the floating button or press Cmd+Shift+L to activate.');
