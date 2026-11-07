// Open in App - Background Service Worker (Manifest V3 ES Module)

import { DEFAULT_CONFIG } from './utils/matcher.js';
import { getInstalledPWAs, getMatchingTabs } from './background/tab-query.js';
import { updateActionPopup, updateBadge, scheduleBadgeUpdate } from './background/badge.js';
import { moveOrReuseTab, moveTabsThrottled } from './background/tab-mover.js';

const manifestVersion = chrome.runtime.getManifest().version;
console.log(`[Open in App v${manifestVersion}] Background Service Worker active`);

// Setup default configuration and context menus on install
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get([
    'presets',
    'disabledInstalledAppIds',
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
  if (!existing.disabledInstalledAppIds) updates.disabledInstalledAppIds = DEFAULT_CONFIG.disabledInstalledAppIds;
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

// Event listeners for badge updates (debounced to avoid event storms)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    scheduleBadgeUpdate(600);
  }
});
chrome.tabs.onActivated.addListener(() => scheduleBadgeUpdate(400));
chrome.tabs.onRemoved.addListener(() => scheduleBadgeUpdate(400));
chrome.windows.onFocusChanged.addListener((winId) => {
  if (winId !== chrome.windows.WINDOW_ID_NONE) {
    scheduleBadgeUpdate(400);
  }
});
chrome.storage.onChanged.addListener(() => scheduleBadgeUpdate(300));

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
          const tabs = await getMatchingTabs(scope, Boolean(message.forceRefresh));
          sendResponse({ success: true, tabs });
          break;
        }

        case 'GET_INSTALLED_APPS': {
          const apps = await getInstalledPWAs(Boolean(message.forceRefresh));
          sendResponse({ success: true, apps });
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
            'disabledInstalledAppIds',
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
            disabledInstalledAppIds: data.disabledInstalledAppIds || [],
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
          if (message.disabledInstalledAppIds !== undefined) updates.disabledInstalledAppIds = message.disabledInstalledAppIds;
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
