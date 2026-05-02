/**
 * Redline Content Script Entry Point
 * Initializes the element inspector and handles messages from background
 */

import { ElementInspector } from './ElementInspector';
import { FloatingButton } from './FloatingButton';
import type { Message } from '../shared/types';

// Forward declare so inspector can reference it
let floatingButton: FloatingButton;
let isEnabled = true;
let lastPersistedActive: boolean | null = null;

/**
 * Sync button state based on inspector state
 */
function syncButtonStates(): void {
  const isActive = inspector.getIsActive();
  
  // Single button shows active when hybrid mode is on
  floatingButton.setRedlineActive(isActive);

  persistActiveState(isActive);
  
  chrome.runtime.sendMessage({
    type: 'STATE_CHANGED',
    isActive,
  });
}

function applyEnabledState(enabled: boolean): void {
  isEnabled = enabled;
  if (enabled) {
    floatingButton.show();
    return;
  }

  floatingButton.hide();
  persistActiveState(false);
  // Deactivate inspector if it's active
  if (inspector.getIsActive()) {
    inspector.deactivate();
    syncButtonStates();
  }
}

function persistActiveState(isActive: boolean): void {
  if (lastPersistedActive === isActive) return;
  lastPersistedActive = isActive;
  void chrome.storage.local.set({ redlineIsActive: isActive });
}

async function restoreState(): Promise<void> {
  const result = await chrome.storage.local.get({
    redlineEnabled: true,
    redlineIsActive: false,
  });
  const enabled = result.redlineEnabled !== false;
  const active = result.redlineIsActive === true;

  lastPersistedActive = active;
  applyEnabledState(enabled);
  if (enabled && active && !inspector.getIsActive()) {
    inspector.activate();
    syncButtonStates();
  }
}

// Initialize inspector with callback for when it deactivates itself (e.g., via Escape)
const inspector = new ElementInspector({
  onDeactivate: () => syncButtonStates(),
});

// Initialize floating button with redline mode toggle
floatingButton = new FloatingButton({
  onToggleRedline: () => {
    const isCurrentlyActive = inspector.getIsActive();
    
    if (isCurrentlyActive) {
      // Turn off redline mode
      inspector.deactivate();
    } else {
      // Turn on redline mode (not hybrid - Shift will show rulers)
      inspector.activate();
    }
    
    syncButtonStates();
  },
  onCollapse: (collapsed) => {
    if (collapsed && inspector.getIsActive()) {
      inspector.deactivate();
      syncButtonStates();
    }
  },
});

// Mount floating button (starts hidden) and check enabled state
floatingButton.mount();
restoreState();

// React to enable/disable changes from other extension contexts
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.redlineEnabled) {
    const enabled = changes.redlineEnabled.newValue !== false;
    applyEnabledState(enabled);
  }

  if (changes.redlineIsActive && isEnabled) {
    const shouldBeActive = changes.redlineIsActive.newValue === true;
    lastPersistedActive = shouldBeActive;
    if (shouldBeActive && !inspector.getIsActive()) {
      inspector.activate();
      syncButtonStates();
    } else if (!shouldBeActive && inspector.getIsActive()) {
      inspector.deactivate();
      syncButtonStates();
    }
  }
});

// Expose for debugging
(window as unknown as Record<string, unknown>).__redlineInspector = inspector;
(window as unknown as Record<string, unknown>).__redlineFloatingButton = floatingButton;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_INSPECTION': {
      if (!isEnabled) {
        sendResponse({ success: false });
        return;
      }
      const isCurrentlyActive = inspector.getIsActive();

      if (isCurrentlyActive) {
        inspector.deactivate();
      } else {
        inspector.activate();
      }

      syncButtonStates();
      sendResponse({ success: true });
      return;
    }

    case 'GET_STATE':
      sendResponse({ isActive: inspector.getIsActive() });
      return;

    case 'REDLINE_ENABLED_CHANGED':
      applyEnabledState(message.enabled);
      sendResponse({ success: true });
      return;
  }
});

function isToggleShortcut(e: KeyboardEvent): boolean {
  if (e.repeat || e.code !== 'KeyL') return false;
  const cmdOrCtrl = e.metaKey || e.ctrlKey;
  const primary = cmdOrCtrl && e.shiftKey && !e.altKey;
  const alternate = e.altKey && e.shiftKey && !cmdOrCtrl;
  return primary || alternate;
}

// Page-level backup when focus is in the tab (chrome.commands fires without passing keys to the page)
document.addEventListener(
  'keydown',
  (e) => {
    if (!isEnabled || !isToggleShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();

    const isCurrentlyActive = inspector.getIsActive();
    if (isCurrentlyActive) {
      inspector.deactivate();
    } else {
      inspector.activate();
    }
    syncButtonStates();
  },
  true,
);

console.log(
  '[Redline] Content script loaded. Toggle: ⌘⇧L / Ctrl+Shift+L or ⌥⇧L / Alt+Shift+L (see chrome://extensions/shortcuts if a chord does nothing).',
);
