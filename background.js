// Tabs to PWA - Production Background Service Worker (Manifest V3)

const DEFAULT_PRESETS = [
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

const DEFAULT_CONFIG = {
  presets: DEFAULT_PRESETS,
  customDomains: [],
  windowMode: 'popup',   // 'popup' (frameless) or 'normal' (with toolbar & extension buttons)
  windowScope: 'current' // 'current' or 'all'
};

// Initialize configuration on installation or update
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(['presets', 'customDomains', 'windowMode', 'windowScope']);
  const updates = {};
  if (!existing.presets) updates.presets = DEFAULT_CONFIG.presets;
  if (!existing.customDomains) updates.customDomains = DEFAULT_CONFIG.customDomains;
  if (!existing.windowMode) updates.windowMode = DEFAULT_CONFIG.windowMode;
  if (!existing.windowScope) updates.windowScope = DEFAULT_CONFIG.windowScope;

  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }
});

/**
 * Helper to get active domains
 */
async function getActiveDomains() {
  const data = await chrome.storage.sync.get(['presets', 'customDomains']);
  const presets = data.presets || DEFAULT_PRESETS;
  const custom = data.customDomains || [];

  const active = [];
  for (const p of presets) {
    if (p.enabled) active.push(p.domain.toLowerCase().trim());
  }
  for (const c of custom) {
    const domainStr = typeof c === 'string' ? c : c.domain;
    const isEnabled = typeof c === 'object' ? c.enabled !== false : true;
    if (isEnabled && domainStr) {
      active.push(domainStr.toLowerCase().trim());
    }
  }
  return active;
}

/**
 * Check if URL matches any active domain
 */
function urlMatchesPwa(urlStr, activeDomains) {
  if (!urlStr || !urlStr.startsWith('http')) return false;
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    return activeDomains.some((d) => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Query matching tabs based on scope ('current' or 'all')
 */
async function getMatchingTabs(scope = 'current') {
  const activeDomains = await getActiveDomains();
  if (activeDomains.length === 0) return [];

  // Exclude tabs that are already single-tab popup windows
  const allWindows = await chrome.windows.getAll({ populate: true });
  const popupWindowIds = new Set();

  for (const win of allWindows) {
    if (win.type === 'popup' || (win.tabs && win.tabs.length === 1 && win.type === 'popup')) {
      popupWindowIds.add(win.id);
    }
  }

  let tabsToScan = [];
  if (scope === 'all') {
    tabsToScan = await chrome.tabs.query({});
  } else {
    const currentWin = await chrome.windows.getLastFocused();
    if (currentWin?.id) {
      tabsToScan = await chrome.tabs.query({ windowId: currentWin.id });
    } else {
      tabsToScan = await chrome.tabs.query({ currentWindow: true });
    }
  }

  return tabsToScan.filter((tab) => {
    if (!tab.url || popupWindowIds.has(tab.windowId)) return false;
    return urlMatchesPwa(tab.url, activeDomains);
  });
}

/**
 * Delay helper for throttling
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Throttled batch tab mover: moves tabs into standalone windows sequentially
 * with interval pacing so Chrome and window compositors don't stutter or crash.
 */
async function moveTabsThrottled(tabIds, windowMode = 'popup', onProgress = null) {
  let movedCount = 0;
  const total = tabIds.length;
  const delayMs = total > 15 ? 150 : 100; // slightly longer spacing if moving 15+ tabs

  for (let i = 0; i < total; i++) {
    const tabId = tabIds[i];
    try {
      // Verify tab is still open
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab) {
        await chrome.windows.create({
          tabId: tab.id,
          type: windowMode,
          focused: i === total - 1 // focus the last created window
        });
        movedCount++;
      }
    } catch (err) {
      console.warn(`Could not move tab ${tabId}:`, err);
    }

    if (onProgress) {
      onProgress(i + 1, total, movedCount);
    }

    // Yield between window creations
    if (i < total - 1) {
      await sleep(delayMs);
    }
  }

  // Flash action badge to indicate completion
  if (movedCount > 0) {
    await chrome.action.setBadgeText({ text: String(movedCount) });
    await chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    setTimeout(async () => {
      await chrome.action.setBadgeText({ text: '' });
    }, 3000);
  }

  return movedCount;
}

// Global keyboard shortcut handler (Alt+Shift+P)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'move_all_pwas') {
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
            // Optional progress ping to popup
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
            'windowScope'
          ]);
          sendResponse({
            success: true,
            presets: data.presets || DEFAULT_PRESETS,
            customDomains: data.customDomains || [],
            windowMode: data.windowMode || DEFAULT_CONFIG.windowMode,
            windowScope: data.windowScope || DEFAULT_CONFIG.windowScope
          });
          break;
        }

        case 'SAVE_CONFIG': {
          const updates = {};
          if (message.presets !== undefined) updates.presets = message.presets;
          if (message.customDomains !== undefined) updates.customDomains = message.customDomains;
          if (message.windowMode !== undefined) updates.windowMode = message.windowMode;
          if (message.windowScope !== undefined) updates.windowScope = message.windowScope;

          await chrome.storage.sync.set(updates);
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
