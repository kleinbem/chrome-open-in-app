// Tabs to PWA - Background Service Worker

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

// Initialize default settings on installation
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(['presets', 'customDomains']);
  if (!existing.presets) {
    await chrome.storage.sync.set({
      presets: DEFAULT_PRESETS,
      customDomains: []
    });
  }
});

/**
 * Get active domain patterns from storage
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
    if (c.enabled !== false && c.domain) {
      active.push(c.domain.toLowerCase().trim());
    }
  }
  return active;
}

/**
 * Check if a URL matches any active PWA domain
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
 * Query all open tabs that match active PWA rules, excluding tabs already in popup windows
 */
async function getMatchingTabs(windowId = null) {
  const activeDomains = await getActiveDomains();
  if (activeDomains.length === 0) return [];

  const allWindows = await chrome.windows.getAll({ populate: false });
  const popupWindowIds = new Set(
    allWindows.filter((w) => w.type === 'popup').map((w) => w.id)
  );

  const queryOptions = windowId ? { windowId } : {};
  const tabs = await chrome.tabs.query(queryOptions);

  return tabs.filter((t) => {
    if (!t.url || popupWindowIds.has(t.windowId)) return false;
    return urlMatchesPwa(t.url, activeDomains);
  });
}

/**
 * Convert an individual tab into a standalone popup/app window
 */
async function moveTabToPwa(tabId) {
  return await chrome.windows.create({
    tabId,
    type: 'popup',
    focused: true
  });
}

/**
 * Move all matching tabs into standalone windows
 */
async function moveAllMatchingTabs(windowId = null) {
  const matchingTabs = await getMatchingTabs(windowId);
  let count = 0;

  for (const tab of matchingTabs) {
    try {
      await moveTabToPwa(tab.id);
      count++;
    } catch (err) {
      console.error(`Failed to move tab ${tab.id} (${tab.url}):`, err);
    }
  }

  // Flash action badge to indicate success
  if (count > 0) {
    await chrome.action.setBadgeText({ text: String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    setTimeout(async () => {
      await chrome.action.setBadgeText({ text: '' });
    }, 2500);
  }

  return count;
}

// Keyboard shortcut listener (Alt+Shift+P)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'move_all_pwas') {
    const currentWin = await chrome.windows.getLastFocused();
    await moveAllMatchingTabs(currentWin?.id || null);
  }
});

// Runtime message listener for popup interactions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {
      case 'GET_MATCHING_TABS': {
        const tabs = await getMatchingTabs(message.windowId || null);
        sendResponse({ success: true, tabs });
        break;
      }
      case 'MOVE_TAB': {
        await moveTabToPwa(message.tabId);
        sendResponse({ success: true });
        break;
      }
      case 'MOVE_ALL_TABS': {
        const count = await moveAllMatchingTabs(message.windowId || null);
        sendResponse({ success: true, count });
        break;
      }
      case 'GET_CONFIG': {
        const data = await chrome.storage.sync.get(['presets', 'customDomains']);
        sendResponse({
          success: true,
          presets: data.presets || DEFAULT_PRESETS,
          customDomains: data.customDomains || []
        });
        break;
      }
      case 'SAVE_CONFIG': {
        await chrome.storage.sync.set({
          presets: message.presets,
          customDomains: message.customDomains
        });
        sendResponse({ success: true });
        break;
      }
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  })();
  return true; // Keep channel open for async response
});
