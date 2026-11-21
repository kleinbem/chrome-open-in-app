// Tab mover and PWA launcher orchestrator
// Extracted from background.js for modularity

import {
  urlMatchesApp,
  findExistingAppWindow,
  findMatchingInstalledApp
} from '../utils/matcher.js';
import { getInstalledPWAs, loadActiveDomains } from './tab-query.js';
import { updateBadge, scheduleBadgeUpdate, setBadgeBusy } from './badge.js';

/**
 * Pacing helper
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Move or reuse a single tab into an app window
 */
export async function moveOrReuseTab(tab, windowMode = 'popup', reuseExisting = true, isFocused = true) {
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

  // 1C. Tab is already in the target app window:
  if (existing && existing.window.id === tab.windowId) {
    if (isFocused) {
      await chrome.windows.update(existing.window.id, { focused: true });
      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    }
    return true;
  }

  // 2. Genuine App Launcher via Native Messaging
  // Only reached when NO existing app window is open for this application.
  if (typeof chrome.runtime?.sendNativeMessage === 'function') {
    try {
      const installedApps = await getInstalledPWAs();
      const matchedPWA = findMatchingInstalledApp(tab.url, installedApps);

      const nativePayload = {
        action: 'LAUNCH',
        url: tab.url
      };
      if (matchedPWA?.id) {
        nativePayload.appId = matchedPWA.id;
      }

      const beforeWins = await chrome.windows.getAll({ windowTypes: ['normal', 'popup', 'app'] });
      const beforeWinIds = new Set(beforeWins.map((w) => w.id));

      const nativeRes = await new Promise((resolve) => {
        chrome.runtime.sendNativeMessage(
          'com.kleinbem.open_in_app',
          nativePayload,
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
          if (!newAppWin) {
            // Check if tab was opened/focused in an existing app window matching this URL
            newAppWin = currentWins.find(
              (w) => (w.type === 'app' || w.type === 'popup') &&
                     w.tabs?.some((t) => t.url === tab.url || t.pendingUrl === tab.url)
            );
          }
          if (newAppWin) break;
        }

        if (newAppWin) {
          console.log(`[Open in App] New app window #${newAppWin.id} opened for ${tab.url}`);
          if (newAppWin.tabs && newAppWin.tabs.length > 0) {
            const currentTab = newAppWin.tabs[0];
            const isAlreadyNavigating = currentTab.url === tab.url || currentTab.pendingUrl === tab.url;
            if (!isAlreadyNavigating) {
              await chrome.tabs.update(currentTab.id, { url: tab.url, active: true }).catch(() => {});
            }
          }
          await chrome.windows.update(newAppWin.id, { focused: isFocused });
          await chrome.tabs.remove(tab.id).catch(() => {});
          return true;
        } else if (nativeRes?.isPwa) {
          console.log(`[Open in App] Native PWA launch confirmed for ${tab.url}`);
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
export async function moveTabsThrottled(tabIds, windowMode = 'popup', onProgress = null) {
  let movedCount = 0;
  const total = tabIds.length;
  const delayMs = total > 20 ? 100 : 200;
  const config = await chrome.storage.sync.get(['reuseExistingAppWindow']);
  const reuseExisting = config.reuseExistingAppWindow !== false;

  setBadgeBusy(true);
  try {
    for (let i = 0; i < total; i++) {
      const tabId = tabIds[i];
      try {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (tab) {
          const success = await moveOrReuseTab(tab, windowMode, reuseExisting, true);
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
  } finally {
    setBadgeBusy(false);
  }

  if (movedCount > 0) {
    await chrome.action.setBadgeText({ text: String(movedCount) });
    await chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    setTimeout(async () => {
      await updateBadge();
    }, 3000);
  } else {
    scheduleBadgeUpdate(500);
  }

  return movedCount;
}
