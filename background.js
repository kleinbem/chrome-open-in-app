// Open in App - Background Service Worker (Manifest V3 ES Module)

import {
  getActiveDomains,
  filterEligibleTabs,
  findExistingAppWindow,
  DEFAULT_CONFIG
} from './utils/matcher.js';

const manifestVersion = chrome.runtime.getManifest().version;
console.log(`[Open in App v${manifestVersion}] Background Service Worker active`);

// Setup default configuration and context menus on install
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get([
    'presets',
    'customDomains',
    'windowMode',
    'windowScope',
    'ignorePinnedTabs',
    'reuseExistingAppWindow',
    'toolbarAction',
    'defaultGrouping'
  ]);

  const updates = {};
  if (!existing.presets) updates.presets = DEFAULT_CONFIG.presets;
  if (!existing.customDomains) updates.customDomains = DEFAULT_CONFIG.customDomains;
  if (!existing.windowMode) updates.windowMode = DEFAULT_CONFIG.windowMode;
  if (!existing.windowScope) updates.windowScope = DEFAULT_CONFIG.windowScope;
  if (existing.ignorePinnedTabs === undefined) updates.ignorePinnedTabs = DEFAULT_CONFIG.ignorePinnedTabs;
  if (existing.reuseExistingAppWindow === undefined) updates.reuseExistingAppWindow = DEFAULT_CONFIG.reuseExistingAppWindow;
  if (!existing.toolbarAction) updates.toolbarAction = DEFAULT_CONFIG.toolbarAction;
  if (!existing.defaultGrouping) updates.defaultGrouping = DEFAULT_CONFIG.defaultGrouping;

  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }

  await updateActionPopup(existing.toolbarAction || DEFAULT_CONFIG.toolbarAction);

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
 * Configure Chrome action popup vs tab click behavior
 */
async function updateActionPopup(toolbarAction) {
  try {
    if (toolbarAction === 'tab') {
      await chrome.action.setPopup({ popup: '' });
    } else {
      await chrome.action.setPopup({ popup: 'popup/popup.html' });
    }
  } catch (err) {
    console.error('Failed to update action popup mode:', err);
  }
}

// Ensure correct action popup mode is applied on worker wakeup
(async () => {
  try {
    const data = await chrome.storage.sync.get(['toolbarAction']);
    await updateActionPopup(data.toolbarAction || DEFAULT_CONFIG.toolbarAction);
  } catch {
    // Ignore storage readiness errors on immediate boot
  }
})();

// When toolbarAction is 'tab', clicking the action icon fires chrome.action.onClicked
chrome.action.onClicked.addListener(async () => {
  const targetUrl = chrome.runtime.getURL('popup/popup.html?mode=tab');
  try {
    const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('popup/popup.html*') });
    if (tabs.length > 0) {
      const existingTab = tabs[0];
      await chrome.windows.update(existingTab.windowId, { focused: true });
      await chrome.tabs.update(existingTab.id, { active: true });
    } else {
      await chrome.tabs.create({ url: targetUrl });
    }
  } catch (err) {
    console.error('Failed to focus or open full tab dashboard:', err);
  }
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

  const allWindows = await chrome.windows.getAll({
    populate: true,
    windowTypes: ['normal', 'popup', 'app']
  });
  const popupWindowIds = new Set();
  for (const win of allWindows) {
    if (win.type === 'popup' || win.type === 'app' || (win.tabs && win.tabs.length === 1 && win.type === 'popup')) {
      popupWindowIds.add(win.id);
    }
  }

  let rawTabs = [];
  if (scope === 'all') {
    rawTabs = await chrome.tabs.query({});
  } else {
    const currentWin = await chrome.windows.getLastFocused({
      windowTypes: ['normal', 'popup', 'app']
    });
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
 * Move or reuse a single tab into an app window
 */
async function moveOrReuseTab(tab, windowMode = 'popup', reuseExisting = true, isFocused = true) {
  if (!tab || !tab.url) return false;

  const activeDomains = await loadActiveDomains();

  // Query all currently open windows to check for existing instances
  const allWindows = await chrome.windows.getAll({
    populate: true,
    windowTypes: ['normal', 'popup', 'app']
  });
  const existing = reuseExisting ? findExistingAppWindow(tab.url, allWindows, activeDomains) : null;

  // 1A. Exact URL match in existing app/popup window (true duplicate tab):
  // Focus the existing window, activate that tab, and safely remove the duplicate tab.
  if (existing && existing.isExactMatch && existing.window.id !== tab.windowId) {
    console.log(`[Open in App] Reusing open app window with exact URL (${existing.window.type} #${existing.window.id}) for ${tab.url}`);
    await chrome.windows.update(existing.window.id, { focused: isFocused });
    if (existing.primaryTab?.id) {
      await chrome.tabs.update(existing.primaryTab.id, { active: true });
    }
    await chrome.tabs.remove(tab.id).catch(() => {});
    return true;
  }

  // 1B. Dedicated Window Mode (windowMode === 'normal'):
  // If a dedicated normal window for this app already exists, move this tab as a NEW tab to it!
  if (windowMode === 'normal' && reuseExisting) {
    let matchedDomain = null;
    try {
      const hostname = new URL(tab.url).hostname.toLowerCase();
      matchedDomain = activeDomains.find((d) => hostname === d || hostname.endsWith('.' + d));
    } catch {}

    if (matchedDomain) {
      const normalAppWin = allWindows.find(
        (w) => w.type === 'normal' && w.id !== tab.windowId &&
               Array.isArray(w.tabs) && w.tabs.length > 0 &&
               w.tabs.every((t) => t && t.url && urlMatchesApp(t.url, [matchedDomain]))
      );

      if (normalAppWin) {
        console.log(`[Open in App] Moving tab ${tab.id} into dedicated normal window #${normalAppWin.id}`);
        await chrome.tabs.move(tab.id, { windowId: normalAppWin.id, index: -1 });
        await chrome.windows.update(normalAppWin.id, { focused: isFocused });
        await chrome.tabs.update(tab.id, { active: true });
        return true;
      }
    }
  }

  // 1C. In App / Popup Mode ('popup' / 'app'):
  // If the URL is different, we MUST NOT overwrite the existing window's tab!
  // App windows do not have tab bars, so each distinct URL gets its own clean app window.
  const hasExistingAppInstance = Boolean(existing);

  // 2. Genuine App Launcher via Native Messaging
  if (typeof chrome.runtime?.sendNativeMessage === 'function') {
    try {
      const beforeWins = await chrome.windows.getAll({ windowTypes: ['normal', 'popup', 'app'] });
      const beforeWinIds = new Set(beforeWins.map((w) => w.id));

      const nativeRes = await new Promise((resolve) => {
        chrome.runtime.sendNativeMessage(
          'com.kleinbem.open_in_app',
          { url: tab.url, preferAppUrl: hasExistingAppInstance },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response);
            }
          }
        );
      });

      if (nativeRes?.success) {
        console.log(`[Open in App] Native host launched app for ${tab.url}`, nativeRes);

        // Wait for the new app window to register in Chrome
        let newAppWin = null;
        for (let attempt = 0; attempt < 25; attempt++) {
          await sleep(100);
          const currentWins = await chrome.windows.getAll({
            populate: true,
            windowTypes: ['normal', 'popup', 'app']
          });
          newAppWin = currentWins.find(
            (w) => !beforeWinIds.has(w.id) && (w.type === 'app' || w.type === 'popup')
          );
          if (newAppWin) break;
        }

        if (newAppWin) {
          console.log(`[Open in App] New app window #${newAppWin.id} opened. Navigating to ${tab.url}`);
          if (newAppWin.tabs && newAppWin.tabs.length > 0) {
            const currentTab = newAppWin.tabs[0];
            if (currentTab.url !== tab.url) {
              await chrome.tabs.update(currentTab.id, { url: tab.url, active: true });
            }
          }
          await chrome.windows.update(newAppWin.id, { focused: isFocused });
          await chrome.tabs.remove(tab.id).catch(() => {});
          return true;
        } else {
          // If no new window was detected, NEVER delete tab.id! Fall back to chrome.windows.create!
          console.warn('[Open in App] New app window was not detected in time. Falling back to chrome.windows.create');
        }
      }
    } catch (err) {
      console.warn('[Open in App] Native messaging launch bypassed:', err);
    }
  }

  // 3. Fallback: Create a clean new window for the tab using Chrome Extensions API
  console.log(`[Open in App] Opening new window (mode: ${windowMode}) for tab ${tab.id}`);
  await chrome.windows.create({
    tabId: tab.id,
    type: windowMode,
    focused: isFocused
  });
  return true;
}

/**
 * Throttled batch tab mover
 */
async function moveTabsThrottled(tabIds, windowMode = 'popup', onProgress = null) {
  let movedCount = 0;
  const total = tabIds.length;
  const delayMs = total > 15 ? 150 : 100;
  const config = await chrome.storage.sync.get(['reuseExistingAppWindow']);
  const reuseExisting = config.reuseExistingAppWindow !== false;

  for (let i = 0; i < total; i++) {
    const tabId = tabIds[i];
    try {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab) {
        const success = await moveOrReuseTab(tab, windowMode, reuseExisting, i === total - 1);
        if (success) movedCount++;
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
      const config = await chrome.storage.sync.get(['reuseExistingAppWindow']);
      const reuseExisting = config.reuseExistingAppWindow !== false;
      await moveOrReuseTab(tab, mode, reuseExisting, true);
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
            const config = await chrome.storage.sync.get(['reuseExistingAppWindow']);
            const reuseExisting = config.reuseExistingAppWindow !== false;
            await moveOrReuseTab(tab, message.windowMode || 'popup', reuseExisting, true);
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
            'ignorePinnedTabs',
            'reuseExistingAppWindow',
            'toolbarAction',
            'defaultGrouping'
          ]);
          sendResponse({
            success: true,
            presets: data.presets || DEFAULT_CONFIG.presets,
            customDomains: data.customDomains || [],
            windowMode: data.windowMode || DEFAULT_CONFIG.windowMode,
            windowScope: data.windowScope || DEFAULT_CONFIG.windowScope,
            ignorePinnedTabs: data.ignorePinnedTabs !== undefined ? data.ignorePinnedTabs : DEFAULT_CONFIG.ignorePinnedTabs,
            reuseExistingAppWindow: data.reuseExistingAppWindow !== undefined ? data.reuseExistingAppWindow : DEFAULT_CONFIG.reuseExistingAppWindow,
            toolbarAction: data.toolbarAction || DEFAULT_CONFIG.toolbarAction,
            defaultGrouping: data.defaultGrouping || DEFAULT_CONFIG.defaultGrouping
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
          if (message.reuseExistingAppWindow !== undefined) updates.reuseExistingAppWindow = message.reuseExistingAppWindow;
          if (message.toolbarAction !== undefined) {
            updates.toolbarAction = message.toolbarAction;
            await updateActionPopup(message.toolbarAction);
          }
          if (message.defaultGrouping !== undefined) updates.defaultGrouping = message.defaultGrouping;

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

globalThis.moveOrReuseTab = moveOrReuseTab;
