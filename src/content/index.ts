/**
 * Redline Content Script Entry Point
 * Initializes the element inspector and handles messages from background
 */

import { ElementInspector } from './ElementInspector';
import { FloatingButton } from './FloatingButton';
import type { Message } from '../shared/types';

// Idempotency guard: the content script can be injected more than once on the
// same page (manifest auto-inject + chrome.scripting.executeScript fallback
// from the background/popup). Re-running the entry would mount a second
// floating button. A DOM sentinel works across isolated-world re-runs.
const SENTINEL_ID = 'redline-content-script-loaded';
if (document.getElementById(SENTINEL_ID)) {
  // Another instance already initialized on this page. Bail out.
} else {
  const sentinel = document.createElement('meta');
  sentinel.id = SENTINEL_ID;
  sentinel.setAttribute('data-redline-ui', 'true');
  (document.head || document.documentElement).appendChild(sentinel);
  initRedline();
}

function initRedline(): void {

// Forward declare so inspector can reference it
let floatingButton: FloatingButton;
let lastPersistedActive: boolean | null = null;

/**
 * Sync button state based on inspector state
 */
function syncButtonStates(): void {
  const isActive = inspector.getIsActive();

  // Single button reflects whether ruler mode is active
  floatingButton.setRedlineActive(isActive);

  persistActiveState(isActive);

  chrome.runtime.sendMessage({
    type: 'STATE_CHANGED',
    isActive,
  });
}

function persistActiveState(isActive: boolean): void {
  if (lastPersistedActive === isActive) return;
  lastPersistedActive = isActive;
  void chrome.storage.local.set({ redlineIsActive: isActive });
}

async function restoreActiveState(): Promise<void> {
  const result = await chrome.storage.local.get({ redlineIsActive: false });
  const active = result.redlineIsActive === true;

  lastPersistedActive = active;
  if (active && !inspector.getIsActive()) {
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
      // Turn on inspection (alignment guides + layer hover)
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

// Mount floating button — always visible on every page
floatingButton.mount();
floatingButton.show();
restoreActiveState();

// Sync inspector state across tabs/contexts
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.redlineIsActive) {
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

/**
 * Shortcut/command toggle: if the bar is collapsed, expand it AND ensure
 * redline is active (since the user explicitly invoked it). Otherwise behave
 * as a normal toggle.
 */
function handleShortcutToggle(): void {
  const wasCollapsed = floatingButton.getIsCollapsed();
  if (wasCollapsed) {
    floatingButton.expand();
    if (!inspector.getIsActive()) inspector.activate();
  } else {
    if (inspector.getIsActive()) {
      inspector.deactivate();
    } else {
      inspector.activate();
    }
  }
  syncButtonStates();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_INSPECTION': {
      handleShortcutToggle();
      sendResponse({ success: true });
      return;
    }

    case 'GET_STATE':
      sendResponse({ isActive: inspector.getIsActive() });
      return;
  }
});

function isToggleShortcut(e: KeyboardEvent): boolean {
  if (e.repeat || !e.shiftKey) return false;
  const cmdOrCtrl = e.metaKey || e.ctrlKey;

  // Primary: Alt+Shift+R (matches manifest "toggle-inspection")
  if (e.code === 'KeyR' && e.altKey && !cmdOrCtrl) return true;

  // Alternate: Ctrl+Shift+L (Windows/Linux) or Cmd+Shift+L (Mac)
  if (e.code === 'KeyL' && cmdOrCtrl && !e.altKey) return true;

  return false;
}

// Page-level backup when focus is in the tab (chrome.commands fires without passing keys to the page)
document.addEventListener(
  'keydown',
  (e) => {
    if (!isToggleShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();
    handleShortcutToggle();
  },
  true,
);

} // end initRedline
