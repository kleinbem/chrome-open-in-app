// Utility functions for domain matching, normalization, and tab filtering
// Hardened against Prototype Pollution and Injection Attacks (ES2024)

export const DEFAULT_PRESETS = Object.freeze([]);

export const DEFAULT_CONFIG = Object.freeze({
  presets: [],                  // empty by default
  disabledInstalledAppIds: [],  // IDs of auto-detected PWAs the user chose to disable
  customDomains: [],            // user-defined domains
  windowMode: 'popup',          // 'popup' (frameless) or 'normal' (with toolbars)
  windowScope: 'current',       // 'current' or 'all'
  ignorePinnedTabs: true,       // whether to protect pinned tabs from batch moves
  reuseExistingAppWindow: true, // switch to existing app/PWA window if already open
  toolbarAction: 'popup',       // 'popup' (dropdown) or 'tab' (full tab dashboard)
  defaultGrouping: 'grouped'    // 'grouped' (by app) or 'flat' (list)
});

// Dangerous keys that must never be processed to prevent Prototype Pollution
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validates whether a domain input is safe and free from prototype injection
 */
export function isSafeDomain(input) {
  if (!input || typeof input !== 'string') return false;
  const clean = input.trim().toLowerCase();
  if (DANGEROUS_KEYS.has(clean) || clean.includes('__proto__')) {
    return false;
  }
  // Disallow javascript:, data:, and control characters
  if (/[\s<>'"`;\\|&]/.test(clean)) {
    return false;
  }
  return true;
}

/**
 * Clean and normalize a user-entered domain or URL
 * Examples:
 *   "https://app.slack.com/client/abc" -> "app.slack.com"
 *   "SLACK.COM/" -> "slack.com"
 *   "   github.com:443  " -> "github.com"
 */
export function normalizeDomain(input) {
  if (!isSafeDomain(input)) return '';
  let str = input.trim().toLowerCase();

  // If missing protocol but has slash or port, prepend https:// for URL parsing
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    str = 'https://' + str;
  }

  try {
    const parsed = new URL(str);
    // Enforce strict HTTP/HTTPS protocol
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    const hostname = parsed.hostname.toLowerCase();
    return DANGEROUS_KEYS.has(hostname) ? '' : hostname;
  } catch {
    // Fallback manual sanitizer
    const fallback = str
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
      .trim();
    return DANGEROUS_KEYS.has(fallback) ? '' : fallback;
  }
}

/**
 * Extract an array of active, clean domain strings from presets, custom domains, and discovered PWAs
 */
export function getActiveDomains(presets = [], customDomains = [], installedApps = [], disabledAppIds = []) {
  const active = [];
  const disabledSet = new Set(Array.isArray(disabledAppIds) ? disabledAppIds : []);

  // 1. User-enabled presets (e.g. from catalog)
  if (Array.isArray(presets)) {
    for (const p of presets) {
      if (p && p.enabled !== false && p.domain && isSafeDomain(p.domain)) {
        const norm = normalizeDomain(p.domain);
        if (norm && !active.includes(norm)) {
          active.push(norm);
        }
      }
    }
  }

  // 2. User-defined custom domains
  if (Array.isArray(customDomains)) {
    for (const c of customDomains) {
      const domainStr = typeof c === 'string' ? c : c?.domain;
      const isEnabled = typeof c === 'object' && c !== null ? c.enabled !== false : true;
      if (isEnabled && domainStr && isSafeDomain(domainStr)) {
        const normalized = normalizeDomain(domainStr);
        if (normalized && !active.includes(normalized)) {
          active.push(normalized);
        }
      }
    }
  }

  // 3. Dynamically discovered OS / browser PWAs (unless disabled by user)
  if (Array.isArray(installedApps)) {
    for (const app of installedApps) {
      if (app && !disabledSet.has(app.id) && Array.isArray(app.domains)) {
        for (const d of app.domains) {
          if (isSafeDomain(d)) {
            const normalized = normalizeDomain(d);
            if (normalized && !active.includes(normalized)) {
              active.push(normalized);
            }
            if (normalized && normalized.startsWith('www.')) {
              const root = normalized.slice(4);
              if (root && !active.includes(root)) {
                active.push(root);
              }
            }
          }
        }
      }
    }
  }

  return active;
}

/**
 * Check if a hostname matches a target domain or is a subdomain of it,
 * handling optional www. prefixes interchangeably.
 */
export function matchDomainOrSubdomain(hostname, targetDomain) {
  if (!hostname || !targetDomain || typeof hostname !== 'string' || typeof targetDomain !== 'string') {
    return false;
  }
  const h = hostname.toLowerCase().trim();
  const t = targetDomain.toLowerCase().trim();
  if (h === t || h.endsWith('.' + t)) return true;
  const hNoWww = h.replace(/^www\./, '');
  const tNoWww = t.replace(/^www\./, '');
  return hNoWww === tNoWww || hNoWww.endsWith('.' + tNoWww);
}

/**
 * Check if a URL string matches any of the active domain patterns.
 * Strictly requires http: or https: protocols, rejecting javascript:, data:, file:, etc.
 */
export function urlMatchesApp(urlStr, activeDomains = []) {
  if (!urlStr || typeof urlStr !== 'string') return false;

  // Fast pre-filter for performance and security
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    return false;
  }

  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();

    const directMatch = activeDomains.some((d) => matchDomainOrSubdomain(hostname, d));
    if (directMatch) return true;

    // Handle Google Captcha/Sorry redirect pages that are waiting to return to an active app
    if ((hostname === 'google.com' || hostname.endsWith('.google.com')) && parsed.pathname.startsWith('/sorry/')) {
      const continueParam = parsed.searchParams.get('continue');
      if (continueParam) {
        try {
          const continueUrl = new URL(continueParam);
          const continueHost = continueUrl.hostname.toLowerCase();
          return activeDomains.some((d) => matchDomainOrSubdomain(continueHost, d));
        } catch {}
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Filter an array of browser tabs to only eligible tabs
 * options:
 *   - ignorePinned (boolean, default true)
 *   - popupWindowIds (Set<number>)
 */
export function filterEligibleTabs(tabs = [], activeDomains = [], options = {}) {
  const ignorePinned = options.ignorePinned !== false;
  const popupWindowIds = options.popupWindowIds || new Set();

  if (!Array.isArray(tabs)) return [];

  return tabs.filter((tab) => {
    if (!tab || !tab.url) return false;
    // Protocol check
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return false;
    // Pinned tab protection
    if (ignorePinned && tab.pinned) return false;
    // Skip tabs already in popup windows
    if (tab.windowId && popupWindowIds.has(tab.windowId)) return false;

    return urlMatchesApp(tab.url, activeDomains);
  });
}

/**
 * Normalizes a URL for deduplication comparison (stripping trailing slash, hashes, tracking params)
 */
export function normalizeUrlForMatching(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  try {
    const u = new URL(urlStr);
    const hash = u.hash ? u.hash.replace(/\/+$/, '') : '';
    return (u.origin + u.pathname.replace(/\/+$/, '') + u.search + hash).toLowerCase();
  } catch {
    return (urlStr || '').toLowerCase().trim();
  }
}

/**
 * Find an existing app window or popup window that belongs to the same web application.
 * Returns { window, primaryTab, isExactMatch } or null.
 * - isExactMatch: true ONLY if an open tab in the window has the identical URL.
 * - isExactMatch: false if a window of the same app/domain exists but with a different URL.
 * @param {string} urlStr - The URL of the tab being moved
 * @param {Array<object>} allWindows - Array of window objects populated with tabs
 * @param {Array<string>} activeDomains - Array of configured active app domains
 * @returns {object|null} - { window, primaryTab, isExactMatch } or null
 */
export function findExistingAppWindow(urlStr, allWindows = [], activeDomains = []) {
  if (!urlStr || typeof urlStr !== 'string' || !Array.isArray(allWindows)) return null;

  // Identify matching active domain for urlStr
  let matchedDomain = null;
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    matchedDomain = activeDomains.find((d) => matchDomainOrSubdomain(hostname, d));
  } catch {
    return null;
  }

  if (!matchedDomain) return null;

  const targetNorm = normalizeUrlForMatching(urlStr);

  // 1. First Priority: Check for an EXACT URL match (true duplicate page)
  const exactCandidates = [];
  for (const win of allWindows) {
    const isAppWindow = win.type === 'app' || win.type === 'popup';
    if (isAppWindow && Array.isArray(win.tabs) && win.tabs.length > 0) {
      const exactTab = win.tabs.find((t) => t && normalizeUrlForMatching(t.url) === targetNorm);
      if (exactTab) {
        exactCandidates.push({ window: win, primaryTab: exactTab });
      }
    }
  }

  if (exactCandidates.length > 0) {
    exactCandidates.sort((a, b) => {
      const typeScoreA = a.window.type === 'app' ? 2 : 1;
      const typeScoreB = b.window.type === 'app' ? 2 : 1;
      if (typeScoreA !== typeScoreB) return typeScoreB - typeScoreA;
      return (b.window.focused ? 1 : 0) - (a.window.focused ? 1 : 0);
    });

    return {
      window: exactCandidates[0].window,
      primaryTab: exactCandidates[0].primaryTab,
      isExactMatch: true
    };
  }

  // 2. Second Priority: Check for any window of the same app domain (different URL)
  const candidateWindows = [];
  for (const win of allWindows) {
    const isAppWindow = win.type === 'app' || win.type === 'popup';
    if (isAppWindow && Array.isArray(win.tabs) && win.tabs.length > 0) {
      const matchingTab = win.tabs.find((t) => t && urlMatchesApp(t.url, [matchedDomain]));
      if (matchingTab) {
        candidateWindows.push({ window: win, primaryTab: matchingTab });
      }
    }
  }

  if (candidateWindows.length > 0) {
    candidateWindows.sort((a, b) => {
      // 1. Prioritize type === 'app' (genuine PWA) over type === 'popup'
      const typeScoreA = a.window.type === 'app' ? 2 : 1;
      const typeScoreB = b.window.type === 'app' ? 2 : 1;
      if (typeScoreA !== typeScoreB) return typeScoreB - typeScoreA;

      // 2. Prioritize focused window
      const focusScoreA = a.window.focused ? 1 : 0;
      const focusScoreB = b.window.focused ? 1 : 0;
      if (focusScoreA !== focusScoreB) return focusScoreB - focusScoreA;

      // 3. Prioritize window already containing more tabs (grouping together)
      const tabsLenA = a.window.tabs?.length || 0;
      const tabsLenB = b.window.tabs?.length || 0;
      return tabsLenB - tabsLenA;
    });

    return {
      window: candidateWindows[0].window,
      primaryTab: candidateWindows[0].primaryTab,
      isExactMatch: false
    };
  }

  return null;
}

/**
 * Find an installed Progressive Web App (PWA) matching the given URL
 * @param {string} urlStr - The URL of the tab being launched
 * @param {Array<object>} installedApps - Array of ExtensionInfo objects from chrome.management.getAll()
 * @returns {object|null} - Matching app object or null
 */
export function findMatchingInstalledApp(urlStr, installedApps = []) {
  if (!urlStr || typeof urlStr !== 'string' || !Array.isArray(installedApps)) return null;
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) return null;

  let targetHostname = '';
  try {
    const parsed = new URL(urlStr);
    targetHostname = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }

  if (!targetHostname || DANGEROUS_KEYS.has(targetHostname)) return null;

  for (const app of installedApps) {
    if (!app || typeof app !== 'object' || app.enabled === false) continue;

    // Must be a web app (hosted_app, packaged_app, desktop PWA with domains/WMClass, or item with appLaunchUrl)
    const isApp = app.type === 'hosted_app' ||
      app.type === 'packaged_app' ||
      Boolean(app.appLaunchUrl) ||
      Boolean(app.startupWmClass) ||
      Array.isArray(app.domains);
    const isExtensionOrTheme = app.type === 'extension' || app.type === 'theme';
    if (!isApp || isExtensionOrTheme) continue;

    // Match via explicit domains array (from OS desktop PWA discovery)
    if (Array.isArray(app.domains)) {
      for (const d of app.domains) {
        if (typeof d === 'string' && d) {
          if (matchDomainOrSubdomain(targetHostname, d)) {
            return app;
          }
        }
      }
    }

    // Match via appLaunchUrl
    if (app.appLaunchUrl && typeof app.appLaunchUrl === 'string') {
      try {
        const appUrl = new URL(app.appLaunchUrl);
        const appHost = appUrl.hostname.toLowerCase();
        if (appHost && !DANGEROUS_KEYS.has(appHost)) {
          if (matchDomainOrSubdomain(targetHostname, appHost) || matchDomainOrSubdomain(appHost, targetHostname)) {
            return app;
          }
        }
      } catch {
        // Ignore invalid appLaunchUrl in installed app metadata
      }
    }

    // Secondary fallback: match via sanitized app name
    if (app.name && typeof app.name === 'string') {
      const cleanName = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanHost = targetHostname.replace(/[^a-z0-9]/g, '');
      if (cleanName.length >= 4 && cleanHost.includes(cleanName)) {
        return app;
      }
    }
  }

  return null;
}

/**
 * Group an array of tabs by their matched web application or domain.
 * @param {Array<object>} tabs - Array of tab objects
 * @param {Array<string>} activeDomains - List of active domain strings
 * @param {Array<object>} presets - List of configured presets
 * @param {Array<object>} installedApps - List of discovered installed PWAs
 * @returns {Array<object>} - Array of group objects: { key, name, domain, icon, tabs: [] }
 */
export function groupTabsByApp(tabs = [], activeDomains = [], presets = [], installedApps = []) {
  if (!Array.isArray(tabs) || tabs.length === 0) return [];

  const groupsMap = new Map();

  for (const tab of tabs) {
    if (!tab || !tab.url) continue;

    let host = '';
    try {
      host = new URL(tab.url).hostname.toLowerCase();
    } catch {
      continue;
    }

    // 1. Check if host matches any dynamically discovered installed PWA
    let matchedInstalledApp = null;
    if (Array.isArray(installedApps)) {
      matchedInstalledApp = installedApps.find((app) => {
        if (!app || !Array.isArray(app.domains)) return false;
        return app.domains.some((d) => matchDomainOrSubdomain(host, d));
      });
    }

    // 2. Check if host matches any preset
    const matchedPreset = Array.isArray(presets)
      ? presets.find((p) => {
          if (!p || !p.domain) return false;
          return matchDomainOrSubdomain(host, p.domain);
        })
      : null;

    let groupKey = '';
    let groupName = '';
    let groupDomain = '';

    if (matchedInstalledApp) {
      groupKey = matchedInstalledApp.id || matchedInstalledApp.name;
      groupName = matchedInstalledApp.name || host;
      groupDomain = matchedInstalledApp.domains?.[0] || host;
    } else if (matchedPreset) {
      groupKey = matchedPreset.id || matchedPreset.domain;
      groupName = matchedPreset.name || matchedPreset.domain;
      groupDomain = matchedPreset.domain;
    } else {
      const matchedDomain = Array.isArray(activeDomains)
        ? activeDomains.find((d) => matchDomainOrSubdomain(host, d))
        : null;

      groupKey = matchedDomain || host;
      groupDomain = matchedDomain || host;
      const parts = groupDomain.replace(/^www\./, '').split('.');
      const namePart = parts.length > 2 && (parts[0] === 'app' || parts[0] === 'web' || parts[0] === 'login' || parts[0] === 'cloud')
        ? parts[1]
        : parts[0];
      groupName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        key: groupKey,
        name: groupName,
        domain: groupDomain,
        icon: tab.favIconUrl || '',
        tabs: []
      });
    }

    const group = groupsMap.get(groupKey);
    if (!group.icon && tab.favIconUrl) {
      group.icon = tab.favIconUrl;
    }
    group.tabs.push(tab);
  }

  return Array.from(groupsMap.values()).sort((a, b) => b.tabs.length - a.tabs.length);
}
