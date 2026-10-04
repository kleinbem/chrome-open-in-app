// Badge and action toolbar state manager
// Extracted from background.js for modularity

import { getMatchingTabs } from './tab-query.js';

let badgeUpdateTimer = null;
let isBadgeBusy = false;

/**
 * Flag to suspend badge updates during batch operations
 */
export function setBadgeBusy(busy) {
  isBadgeBusy = busy;
}

/**
 * Configure Chrome action popup vs tab click behavior
 */
export async function updateActionPopup(toolbarAction) {
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

/**
 * Dynamically update the toolbar badge to show how many app tabs are detected
 */
export async function updateBadge() {
  if (isBadgeBusy) return;

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

/**
 * Debounced badge updater to prevent CPU spikes from rapid tab events
 */
export function scheduleBadgeUpdate(delayMs = 600) {
  if (isBadgeBusy) return;
  if (badgeUpdateTimer) clearTimeout(badgeUpdateTimer);
  badgeUpdateTimer = setTimeout(() => {
    updateBadge();
  }, delayMs);
}
