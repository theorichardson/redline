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
 * Sync both button states based on inspector state
 * Redline and Ruler modes are mutually exclusive
 */
function syncButtonStates(): void {
  const isActive = inspector.getIsActive();
  const isRulerMode = inspector.getIsRulerMode();
  
  // Left button (redline) is active when inspector is on AND not in ruler mode
  floatingButton.setRedlineActive(isActive && !isRulerMode);
  // Right button (ruler) is active when inspector is on AND in ruler mode
  floatingButton.setRulerActive(isActive && isRulerMode);
  
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

// Initialize floating button with mutually exclusive mode logic
floatingButton = new FloatingButton({
  onToggleRedline: () => {
    const isCurrentlyInRedlineMode = inspector.getIsActive() && !inspector.getIsRulerMode();
    
    if (isCurrentlyInRedlineMode) {
      // Turn off redline mode entirely
      inspector.deactivate();
    } else {
      // Turn on redline mode (switch from ruler if needed)
      if (inspector.getIsRulerMode()) {
        inspector.deactivateRulerMode();
      }
      if (!inspector.getIsActive()) {
        inspector.activate();
      }
    }
    
    syncButtonStates();
  },
  onToggleRuler: () => {
    const isCurrentlyInRulerMode = inspector.getIsActive() && inspector.getIsRulerMode();
    
    if (isCurrentlyInRulerMode) {
      // Turn off ruler mode entirely
      inspector.deactivate();
      inspector.deactivateRulerMode(); // Reset the flag
    } else {
      // Turn on ruler mode (activates inspection if needed)
      inspector.activateRulerMode();
      if (!inspector.getIsActive()) {
        inspector.activate();
      }
    }
    
    syncButtonStates();
  },
});

// Mount floating button and check enabled state
floatingButton.mount();
checkEnabledState();

// Expose for debugging
(window as unknown as Record<string, unknown>).__redlineInspector = inspector;
(window as unknown as Record<string, unknown>).__redlineFloatingButton = floatingButton;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_INSPECTION':
      // Toggle redline mode (same logic as left button)
      {
        const isCurrentlyInRedlineMode = inspector.getIsActive() && !inspector.getIsRulerMode();
        
        if (isCurrentlyInRedlineMode) {
          inspector.deactivate();
        } else {
          if (inspector.getIsRulerMode()) {
            inspector.deactivateRulerMode();
          }
          if (!inspector.getIsActive()) {
            inspector.activate();
          }
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
          if (inspector.getIsRulerMode()) {
            inspector.deactivateRulerMode();
          }
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
  // Cmd+Shift+L (Mac) or Ctrl+Shift+L (Windows/Linux) - toggle redline mode
  // Check for both 'L' and 'l' since shift may affect the key value
  const isL = e.key === 'L' || e.key === 'l';
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && isL) {
    e.preventDefault();
    console.log('[Redline] Keyboard shortcut detected, toggling redline mode...');
    
    const isCurrentlyInRedlineMode = inspector.getIsActive() && !inspector.getIsRulerMode();
    
    if (isCurrentlyInRedlineMode) {
      inspector.deactivate();
    } else {
      if (inspector.getIsRulerMode()) {
        inspector.deactivateRulerMode();
      }
      if (!inspector.getIsActive()) {
        inspector.activate();
      }
    }
    
    syncButtonStates();
  }

  // R key to toggle ruler mode
  const isR = e.key === 'R' || e.key === 'r';
  if (isR && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    // Only trigger if not typing in an input
    const target = e.target as Element;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      console.log('[Redline] R key detected, toggling ruler mode...');
      
      const isCurrentlyInRulerMode = inspector.getIsActive() && inspector.getIsRulerMode();
      
      if (isCurrentlyInRulerMode) {
        inspector.deactivate();
        inspector.deactivateRulerMode();
      } else {
        inspector.activateRulerMode();
        if (!inspector.getIsActive()) {
          inspector.activate();
        }
      }
      
      syncButtonStates();
    }
  }
});

console.log('[Redline] Content script loaded. Click the floating button or press Cmd+Shift+L to activate.');
