// Open in App - Background Service Worker (Manifest V3 ES Module)

import {
  getActiveDomains,
  filterEligibleTabs,
  DEFAULT_CONFIG
} from './utils/matcher.js';

// Setup default configuration and context menus on install
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get([
    'presets',
    'customDomains',
    'windowMode',
    'windowScope',
    'ignorePinnedTabs'
  ]);

  const updates = {};
  if (!existing.presets) updates.presets = DEFAULT_CONFIG.presets;
  if (!existing.customDomains) updates.customDomains = DEFAULT_CONFIG.customDomains;
  if (!existing.windowMode) updates.windowMode = DEFAULT_CONFIG.windowMode;
  if (!existing.windowScope) updates.windowScope = DEFAULT_CONFIG.windowScope;
  if (existing.ignorePinnedTabs === undefined) updates.ignorePinnedTabs = DEFAULT_CONFIG.ignorePinnedTabs;

  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }

  // Create Context Menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'open_in_app_current',
      title: 'Open this Tab in App Window',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'open_all_in_app_action',
      title: 'Open All Matching Tabs in App Windows',
      contexts: ['action']
    });
  });

  await updateBadge();
});

/**
 * Get active domains helper
 */
async function loadActiveDomains() {
  const data = await chrome.storage.sync.get(['presets', 'customDomains']);
  return getActiveDomains(data.presets, data.customDomains);
}

/**
 * Query matching tabs based on scope ('current' or 'all') and settings
 */
async function getMatchingTabs(scope = 'current') {
  const activeDomains = await loadActiveDomains();
  if (activeDomains.length === 0) return [];

  const config = await chrome.storage.sync.get(['ignorePinnedTabs']);
  const ignorePinned = config.ignorePinnedTabs !== false;

  const allWindows = await chrome.windows.getAll({ populate: true });
  const popupWindowIds = new Set();
  for (const win of allWindows) {
    if (win.type === 'popup' || (win.tabs && win.tabs.length === 1 && win.type === 'popup')) {
      popupWindowIds.add(win.id);
    }
  }

  let rawTabs = [];
  if (scope === 'all') {
    rawTabs = await chrome.tabs.query({});
  } else {
    const currentWin = await chrome.windows.getLastFocused();
    if (currentWin?.id) {
      rawTabs = await chrome.tabs.query({ windowId: currentWin.id });
    } else {
      rawTabs = await chrome.tabs.query({ currentWindow: true });
    }
  }

  return filterEligibleTabs(rawTabs, activeDomains, {
    ignorePinned,
    popupWindowIds
  });
}

/**
 * Pacing helper
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Throttled batch tab mover
 */
async function moveTabsThrottled(tabIds, windowMode = 'popup', onProgress = null) {
  let movedCount = 0;
  const total = tabIds.length;
  const delayMs = total > 15 ? 150 : 100;

  for (let i = 0; i < total; i++) {
    const tabId = tabIds[i];
    try {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab) {
        await chrome.windows.create({
          tabId: tab.id,
          type: windowMode,
          focused: i === total - 1
        });
        movedCount++;
      }
    } catch (err) {
      console.warn(`Could not open tab ${tabId} in app window:`, err);
    }

    if (onProgress) {
      onProgress(i + 1, total, movedCount);
    }

    if (i < total - 1) {
      await sleep(delayMs);
    }
  }

  if (movedCount > 0) {
    await chrome.action.setBadgeText({ text: String(movedCount) });
    await chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    setTimeout(async () => {
      await updateBadge();
    }, 3000);
  }

  return movedCount;
}

/**
 * Dynamically update the toolbar badge to show how many app tabs are detected
 */
async function updateBadge() {
  try {
    const config = await chrome.storage.sync.get(['windowScope']);
    const scope = config.windowScope || 'current';
    const tabs = await getMatchingTabs(scope);

    if (tabs.length > 0) {
      await chrome.action.setBadgeText({ text: String(tabs.length) });
      await chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    // Ignore errors during tab transition
  }
}

// Event listeners for badge updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateBadge();
  }
});
chrome.tabs.onActivated.addListener(() => updateBadge());
chrome.tabs.onRemoved.addListener(() => updateBadge());
chrome.windows.onFocusChanged.addListener((winId) => {
  if (winId !== chrome.windows.WINDOW_ID_NONE) {
    updateBadge();
  }
});
chrome.storage.onChanged.addListener(() => updateBadge());

// Global keyboard shortcut handler (Alt+Shift+P)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open_all_in_app' || command === 'move_all_pwas') {
    const config = await chrome.storage.sync.get(['windowScope', 'windowMode']);
    const scope = config.windowScope || 'current';
    const mode = config.windowMode || 'popup';

    const matchingTabs = await getMatchingTabs(scope);
    if (matchingTabs.length > 0) {
      const tabIds = matchingTabs.map((t) => t.id);
      await moveTabsThrottled(tabIds, mode);
    }
  }
});

// Context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const config = await chrome.storage.sync.get(['windowMode', 'windowScope']);
  const mode = config.windowMode || 'popup';
  const scope = config.windowScope || 'current';

  if (info.menuItemId === 'open_in_app_current' && tab?.id) {
    try {
      await chrome.windows.create({
        tabId: tab.id,
        type: mode,
        focused: true
      });
      // Flash badge confirmation
      await chrome.action.setBadgeText({ text: '✓' });
      await chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
      setTimeout(() => updateBadge(), 2000);
    } catch (err) {
      console.error('Failed to open tab from context menu:', err);
    }
  } else if (info.menuItemId === 'open_all_in_app_action') {
    const matchingTabs = await getMatchingTabs(scope);
    if (matchingTabs.length > 0) {
      const tabIds = matchingTabs.map((t) => t.id);
      await moveTabsThrottled(tabIds, mode);
    }
  }
});

// Runtime messaging for popup and options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case 'GET_MATCHING_TABS': {
          const scope = message.scope || 'current';
          const tabs = await getMatchingTabs(scope);
          sendResponse({ success: true, tabs });
          break;
        }

        case 'MOVE_TABS': {
          const tabIds = message.tabIds || [];
          const mode = message.windowMode || 'popup';

          const count = await moveTabsThrottled(tabIds, mode, (current, total, moved) => {
            chrome.runtime.sendMessage({
              action: 'PROGRESS_UPDATE',
              current,
              total,
              moved
            }).catch(() => {});
          });

          sendResponse({ success: true, count, total: tabIds.length });
          break;
        }

        case 'MOVE_SINGLE_TAB': {
          const tab = await chrome.tabs.get(message.tabId).catch(() => null);
          if (tab) {
            await chrome.windows.create({
              tabId: tab.id,
              type: message.windowMode || 'popup',
              focused: true
            });
            sendResponse({ success: true });
            setTimeout(() => updateBadge(), 500);
          } else {
            sendResponse({ success: false, error: 'Tab not found' });
          }
          break;
        }

        case 'GET_CONFIG': {
          const data = await chrome.storage.sync.get([
            'presets',
            'customDomains',
            'windowMode',
            'windowScope',
            'ignorePinnedTabs'
          ]);
          sendResponse({
            success: true,
            presets: data.presets || DEFAULT_CONFIG.presets,
            customDomains: data.customDomains || [],
            windowMode: data.windowMode || DEFAULT_CONFIG.windowMode,
            windowScope: data.windowScope || DEFAULT_CONFIG.windowScope,
            ignorePinnedTabs: data.ignorePinnedTabs !== undefined ? data.ignorePinnedTabs : DEFAULT_CONFIG.ignorePinnedTabs
          });
          break;
        }

        case 'SAVE_CONFIG': {
          const updates = {};
          if (message.presets !== undefined) updates.presets = message.presets;
          if (message.customDomains !== undefined) updates.customDomains = message.customDomains;
          if (message.windowMode !== undefined) updates.windowMode = message.windowMode;
          if (message.windowScope !== undefined) updates.windowScope = message.windowScope;
          if (message.ignorePinnedTabs !== undefined) updates.ignorePinnedTabs = message.ignorePinnedTabs;

          await chrome.storage.sync.set(updates);
          await updateBadge();
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (err) {
      console.error('Service worker error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true; // Keep channel open for async response
});
