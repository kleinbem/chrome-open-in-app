// Utility functions for domain matching, normalization, and tab filtering

export const DEFAULT_PRESETS = [
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
];

export const DEFAULT_CONFIG = {
  presets: DEFAULT_PRESETS,
  customDomains: [],
  windowMode: 'popup',       // 'popup' (frameless) or 'normal' (with toolbars)
  windowScope: 'current',    // 'current' or 'all'
  ignorePinnedTabs: true     // whether to protect pinned tabs from batch moves
};

/**
 * Clean and normalize a user-entered domain or URL
 * Examples:
 *   "https://app.slack.com/client/abc" -> "app.slack.com"
 *   "SLACK.COM/" -> "slack.com"
 *   "   github.com:443  " -> "github.com"
 */
export function normalizeDomain(input) {
  if (!input || typeof input !== 'string') return '';
  let str = input.trim().toLowerCase();

  // If missing protocol but has slash or port, prepend https:// for URL parsing
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    str = 'https://' + str;
  }

  try {
    const parsed = new URL(str);
    return parsed.hostname.toLowerCase();
  } catch {
    // Fallback: strip protocols and paths manually
    return str
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
      .trim();
  }
}

/**
 * Extract an array of active, clean domain strings from presets and custom domains
 */
export function getActiveDomains(presets = [], customDomains = []) {
  const active = [];

  for (const p of presets) {
    if (p && p.enabled !== false && p.domain) {
      active.push(normalizeDomain(p.domain));
    }
  }

  for (const c of customDomains) {
    const domainStr = typeof c === 'string' ? c : c?.domain;
    const isEnabled = typeof c === 'object' ? c?.enabled !== false : true;
    if (isEnabled && domainStr) {
      const normalized = normalizeDomain(domainStr);
      if (normalized && !active.includes(normalized)) {
        active.push(normalized);
      }
    }
  }

  return active;
}

/**
 * Check if a URL string matches any of the active domain patterns
 */
export function urlMatchesApp(urlStr, activeDomains = []) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) return false;

  try {
    const parsed = new URL(urlStr);
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
  const { ignorePinned = true, popupWindowIds = new Set() } = options;

  return tabs.filter((tab) => {
    if (!tab || !tab.url) return false;
    // Skip internal browser schemes
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return false;
    // Skip pinned tabs if protection enabled
    if (ignorePinned && tab.pinned) return false;
    // Skip tabs already in popup windows
    if (tab.windowId && popupWindowIds.has(tab.windowId)) return false;

    return urlMatchesApp(tab.url, activeDomains);
  });
}
