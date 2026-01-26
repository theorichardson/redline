/**
 * Redline Content Script Entry Point
 * Initializes the element inspector and handles messages from background
 */

import { ElementInspector } from './ElementInspector';
import { FloatingButton } from './FloatingButton';
import type { Message } from '../shared/types';

// Forward declare so inspector can reference it
let floatingButton: FloatingButton;

/**
 * Sync button state based on inspector state
 */
function syncButtonStates(): void {
  const isActive = inspector.getIsActive();
  
  // Single button shows active when hybrid mode is on
  floatingButton.setRedlineActive(isActive);
  
  chrome.runtime.sendMessage({
    type: 'STATE_CHANGED',
    isActive,
  });
}

/**
 * Check if Redline is enabled and update UI accordingly
 */
async function checkEnabledState(): Promise<void> {
  const result = await chrome.storage.local.get('redlineEnabled');
  const enabled = result.redlineEnabled !== false; // Default to true
  
  if (enabled) {
    floatingButton.show();
  } else {
    floatingButton.hide();
  }
}

// Initialize inspector with callback for when it deactivates itself (e.g., via Escape)
const inspector = new ElementInspector({
  onDeactivate: () => syncButtonStates(),
});

// Initialize floating button with hybrid mode toggle
floatingButton = new FloatingButton({
  onToggleRedline: () => {
    const isCurrentlyActive = inspector.getIsActive();
    
    if (isCurrentlyActive) {
      // Turn off hybrid mode
      inspector.deactivate();
      inspector.deactivateHybridMode();
    } else {
      // Turn on hybrid mode
      inspector.activateHybridMode();
      inspector.activate();
    }
    
    syncButtonStates();
  },
});

// Mount floating button (starts hidden) and check enabled state
floatingButton.mount();
checkEnabledState();

// Expose for debugging
(window as unknown as Record<string, unknown>).__redlineInspector = inspector;
(window as unknown as Record<string, unknown>).__redlineFloatingButton = floatingButton;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_INSPECTION':
      // Toggle hybrid mode
      {
        const isCurrentlyActive = inspector.getIsActive();
        
        if (isCurrentlyActive) {
          inspector.deactivate();
          inspector.deactivateHybridMode();
        } else {
          inspector.activateHybridMode();
          inspector.activate();
        }
        
        syncButtonStates();
      }
      sendResponse({ success: true });
      break;

    case 'GET_STATE':
      sendResponse({ isActive: inspector.getIsActive() });
      break;

    case 'REDLINE_ENABLED_CHANGED':
      // Handle the enable/disable toggle from popup
      if (message.enabled) {
        floatingButton.show();
      } else {
        floatingButton.hide();
        // Deactivate inspector if it's active
        if (inspector.getIsActive()) {
          inspector.deactivate();
          inspector.deactivateHybridMode();
          syncButtonStates();
        }
      }
      sendResponse({ success: true });
      break;
  }

  return true; // Keep channel open
});

// Also listen for keyboard shortcut directly (as backup)
document.addEventListener('keydown', (e) => {
  // Cmd+Shift+L (Mac) or Ctrl+Shift+L (Windows/Linux) - toggle hybrid mode
  // Check for both 'L' and 'l' since shift may affect the key value
  const isL = e.key === 'L' || e.key === 'l';
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && isL) {
    e.preventDefault();
    console.log('[Redline] Keyboard shortcut detected, toggling hybrid mode...');
    
    const isCurrentlyActive = inspector.getIsActive();
    
    if (isCurrentlyActive) {
      inspector.deactivate();
      inspector.deactivateHybridMode();
    } else {
      inspector.activateHybridMode();
      inspector.activate();
    }
    
    syncButtonStates();
  }
});

console.log('[Redline] Content script loaded. Click the floating button or press Cmd+Shift+L to activate.');
