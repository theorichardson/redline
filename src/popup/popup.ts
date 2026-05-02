/**
 * Redline Popup Script
 * Handles popup UI interactions
 */

const activateBtn = document.getElementById('activate-btn') as HTMLButtonElement;
const enableToggle = document.getElementById('enable-toggle') as HTMLElement;

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

/**
 * Get the enabled state from storage
 */
async function getEnabledState(): Promise<boolean> {
  const result = await chrome.storage.local.get('redlineEnabled');
  return result.redlineEnabled !== false; // Default to true
}

/**
 * Set the enabled state in storage
 */
async function setEnabledState(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ redlineEnabled: enabled });
}

/**
 * Update the toggle UI
 */
function updateToggleUI(enabled: boolean): void {
  if (enabled) {
    enableToggle.classList.add('active');
    enableToggle.setAttribute('aria-checked', 'true');
  } else {
    enableToggle.classList.remove('active');
    enableToggle.setAttribute('aria-checked', 'false');
  }
}


// Initialize toggle state
getEnabledState().then((enabled) => {
  updateToggleUI(enabled);
});

// Handle toggle click
enableToggle?.addEventListener('click', async () => {
  const currentState = enableToggle.classList.contains('active');
  const newState = !currentState;
  
  updateToggleUI(newState);
  await setEnabledState(newState);
});

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
  if (isActive) {
    activateBtn.classList.add('active');
    activateBtn.textContent = 'Inspector Active';
  } else {
    activateBtn.classList.remove('active');
    activateBtn.textContent = 'Activate Inspector';
  }
}
