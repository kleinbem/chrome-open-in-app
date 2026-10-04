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
export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

  // 3. Dynamically discovered OS / browser PWAs (unless disabled by user or open-as-window disabled)
  if (Array.isArray(installedApps)) {
    for (const app of installedApps) {
      if (app && app.openInWindow !== false && !disabledSet.has(app.id) && Array.isArray(app.domains)) {
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

// Re-export window and group matching functions from modular window-matcher.js
export {
  findExistingAppWindow,
  findMatchingInstalledApp,
  groupTabsByApp
} from './window-matcher.js';

