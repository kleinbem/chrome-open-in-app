// Querying installed PWAs and matching open browser tabs
// Extracted from background.js for modularity

import { getActiveDomains, filterEligibleTabs } from '../utils/matcher.js';

let cachedInstalledPWAs = [];
let lastPwaFetchTime = 0;
const PWA_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Query native host for installed PWAs with persistent storage caching
 */
export async function getInstalledPWAs(forceRefresh = false) {
  const now = Date.now();

  // 1. Fast path: in-memory cache if worker remained awake
  if (!forceRefresh && cachedInstalledPWAs.length > 0 && (now - lastPwaFetchTime < PWA_CACHE_TTL_MS)) {
    return cachedInstalledPWAs;
  }

  // 2. Check persistent chrome.storage.local before spawning native process
  if (!forceRefresh) {
    try {
      const stored = await chrome.storage.local.get(['cachedInstalledPWAs', 'lastPwaFetchTime']);
      if (
        Array.isArray(stored.cachedInstalledPWAs) &&
        stored.cachedInstalledPWAs.length > 0 &&
        stored.lastPwaFetchTime &&
        (now - stored.lastPwaFetchTime < PWA_CACHE_TTL_MS)
      ) {
        cachedInstalledPWAs = stored.cachedInstalledPWAs;
        lastPwaFetchTime = stored.lastPwaFetchTime;
        return cachedInstalledPWAs;
      }
    } catch {
      // Fall through to query if storage read fails
    }
  }

  // 3. Query native messaging host
  if (typeof chrome.runtime?.sendNativeMessage === 'function') {
    try {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendNativeMessage(
          'com.kleinbem.open_in_app',
          { action: 'LIST_APPS' },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response);
            }
          }
        );
      });

      if (res?.success && Array.isArray(res.apps)) {
        cachedInstalledPWAs = res.apps;
        lastPwaFetchTime = now;
        try {
          await chrome.storage.local.set({ cachedInstalledPWAs, lastPwaFetchTime });
        } catch {}
        console.log(`[Open in App] Dynamically cached ${cachedInstalledPWAs.length} installed PWAs from host`);
        return cachedInstalledPWAs;
      }
    } catch (err) {
      console.warn('[Open in App] Native host PWA discovery bypassed:', err);
    }
  }

  // 4. Fallback to chrome.management.getAll() if native host is unavailable
  if (typeof chrome.management?.getAll === 'function') {
    try {
      const allExtensions = await chrome.management.getAll();
      const apps = allExtensions.filter((item) =>
        item.type === 'hosted_app' || item.type === 'packaged_app' || Boolean(item.appLaunchUrl)
      );
      if (apps.length > 0) {
        cachedInstalledPWAs = apps;
        lastPwaFetchTime = now;
        try {
          await chrome.storage.local.set({ cachedInstalledPWAs, lastPwaFetchTime });
        } catch {}
      }
    } catch {}
  }

  return cachedInstalledPWAs;
}

/**
 * Get active domains helper incorporating presets, custom domains, and discovered PWAs
 */
export async function loadActiveDomains(forceRefresh = false) {
  const [data, installedApps] = await Promise.all([
    chrome.storage.sync.get(['presets', 'customDomains', 'disabledInstalledAppIds']),
    getInstalledPWAs(forceRefresh)
  ]);
  return getActiveDomains(
    data.presets || [],
    data.customDomains || [],
    installedApps || [],
    data.disabledInstalledAppIds || []
  );
}

/**
 * Query matching tabs based on scope ('current' or 'all') and settings
 */
export async function getMatchingTabs(scope = 'current', forceRefresh = false) {
  const activeDomains = await loadActiveDomains(forceRefresh);
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
