// Utility functions for domain matching, normalization, and tab filtering
// Hardened against Prototype Pollution and Injection Attacks (ES2024)

export const DEFAULT_PRESETS = Object.freeze([
  { id: 'youtube', name: 'YouTube', domain: 'youtube.com', enabled: true },
  { id: 'youtube_music', name: 'YouTube Music', domain: 'music.youtube.com', enabled: true },
  { id: 'gmail', name: 'Gmail', domain: 'mail.google.com', enabled: true },
  { id: 'calendar', name: 'Google Calendar', domain: 'calendar.google.com', enabled: true },
  { id: 'chat', name: 'Google Chat', domain: 'chat.google.com', enabled: true },
  { id: 'meet', name: 'Google Meet', domain: 'meet.google.com', enabled: true },
  { id: 'keep', name: 'Google Keep', domain: 'keep.google.com', enabled: true },
  { id: 'drive', name: 'Google Drive', domain: 'drive.google.com', enabled: true },
  { id: 'maps', name: 'Google Maps', domain: 'maps.google.com', enabled: true },
  { id: 'gemini', name: 'Google Gemini', domain: 'gemini.google.com', enabled: true },
  { id: 'ai_studio', name: 'Google AI Studio', domain: 'aistudio.google.com', enabled: true },
  { id: 'messages', name: 'Google Messages', domain: 'messages.google.com', enabled: true },
  { id: 'chatgpt', name: 'ChatGPT', domain: 'chatgpt.com', enabled: true },
  { id: 'claude', name: 'Claude', domain: 'claude.ai', enabled: true },
  { id: 'whatsapp', name: 'WhatsApp Web', domain: 'web.whatsapp.com', enabled: true },
  { id: 'instagram', name: 'Instagram', domain: 'instagram.com', enabled: true }
]);

export const DEFAULT_CONFIG = Object.freeze({
  presets: DEFAULT_PRESETS,
  customDomains: [],
  windowMode: 'popup',          // 'popup' (frameless) or 'normal' (with toolbars)
  windowScope: 'current',       // 'current' or 'all'
  ignorePinnedTabs: true,       // whether to protect pinned tabs from batch moves
  reuseExistingAppWindow: true  // switch to existing app/PWA window if already open
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
 * Extract an array of active, clean domain strings from presets and custom domains
 */
export function getActiveDomains(presets = [], customDomains = []) {
  const active = [];

  if (Array.isArray(presets)) {
    for (const p of presets) {
      if (p && p.enabled !== false && p.domain && isSafeDomain(p.domain)) {
        active.push(normalizeDomain(p.domain));
      }
    }
  }

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

  return active;
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

    return activeDomains.some((d) => {
      const clean = d.toLowerCase().trim();
      return hostname === clean || hostname.endsWith('.' + clean);
    });
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
 * Find an existing app window or popup window that belongs to the same web application
 * @param {string} urlStr - The URL of the tab being moved
 * @param {Array<object>} allWindows - Array of window objects populated with tabs
 * @param {Array<string>} activeDomains - Array of configured active app domains
 * @returns {object|null} - { window, primaryTab } or null
 */
export function findExistingAppWindow(urlStr, allWindows = [], activeDomains = []) {
  if (!urlStr || typeof urlStr !== 'string' || !Array.isArray(allWindows)) return null;

  // Identify matching active domain for urlStr
  let matchedDomain = null;
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    matchedDomain = activeDomains.find((d) => {
      const clean = d.toLowerCase().trim();
      return hostname === clean || hostname.endsWith('.' + clean);
    });
  } catch {
    return null;
  }

  if (!matchedDomain) return null;

  for (const win of allWindows) {
    // Recognize native PWA windows ('app') or frameless windows ('popup')
    const isAppWindow = win.type === 'app' || win.type === 'popup';
    if (isAppWindow && Array.isArray(win.tabs) && win.tabs.length > 0) {
      const hasMatchingTab = win.tabs.some((t) => urlMatchesApp(t.url, [matchedDomain]));
      if (hasMatchingTab) {
        return {
          window: win,
          primaryTab: win.tabs[0]
        };
      }
    }
  }

  return null;
}
