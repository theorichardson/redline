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

/**
 * Decide whether this install/update should trigger the FTUX onboarding tour.
 * The tour writes a single integer to chrome.storage.local; the content script
 * picks it up on every open tab and renders the tooltip above the floating
 * bar. Step 3 of the tour itself prompts the user to bind a keyboard shortcut,
 * so we no longer auto-redirect to chrome://extensions/shortcuts on install.
 */
// Anyone on a version older than this should see the FTUX tour on next
// upgrade. 1.1.1 is the first build where the install/upgrade hook
// actually triggers it — 1.1.0 shipped the tooltip code but never wrote
// the storage key, so 1.1.0 users still need to see it on bump to 1.1.1.
const ONBOARDING_INTRODUCED_IN = '1.1.1';
const ONBOARDING_STORAGE_KEY = 'redline-onboarding-step';
const ONBOARDING_STEP2_PROGRESS_KEY = 'redline-onboarding-step2-progress';
const FAB_HIDDEN_KEY = 'redline-floating-button-hidden';
const FAB_COLLAPSED_KEY = 'redline-floating-button-collapsed';

const EMPTY_STEP2_PROGRESS = {
  hovered: false,
  usedUp: false,
  usedDown: false,
  exited: false,
};

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

async function startOnboarding(): Promise<void> {
  // Force the FAB visible+expanded so the tooltip has something to anchor
  // to, and seed step 1 with a clean checklist for step 2.
  await chrome.storage.local.set({
    [ONBOARDING_STORAGE_KEY]: 1,
    [ONBOARDING_STEP2_PROGRESS_KEY]: EMPTY_STEP2_PROGRESS,
    [FAB_HIDDEN_KEY]: false,
    [FAB_COLLAPSED_KEY]: false,
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  void injectIntoAllTabs();

  if (details.reason === 'install') {
    void startOnboarding();
    return;
  }

  // Upgrades: run the tour once for users coming from a version that
  // predates onboarding. compareVersions returns < 0 when previous < cutoff.
  if (
    details.reason === 'update' &&
    details.previousVersion &&
    compareVersions(details.previousVersion, ONBOARDING_INTRODUCED_IN) < 0
  ) {
    void startOnboarding();
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
