import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDomain,
  getActiveDomains,
  urlMatchesApp,
  filterEligibleTabs,
  findExistingAppWindow,
  DEFAULT_PRESETS,
  DEFAULT_CONFIG
} from '../utils/matcher.js';

describe('Domain Normalization', () => {
  test('normalizes standard domain names', () => {
    assert.strictEqual(normalizeDomain('youtube.com'), 'youtube.com');
    assert.strictEqual(normalizeDomain('mail.google.com'), 'mail.google.com');
  });

  test('strips http and https protocols', () => {
    assert.strictEqual(normalizeDomain('https://app.slack.com'), 'app.slack.com');
    assert.strictEqual(normalizeDomain('http://chat.google.com'), 'chat.google.com');
  });

  test('strips trailing paths, slashes, and queries', () => {
    assert.strictEqual(normalizeDomain('https://app.slack.com/client/T123/C456'), 'app.slack.com');
    assert.strictEqual(normalizeDomain('youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube.com');
    assert.strictEqual(normalizeDomain('github.com/'), 'github.com');
  });

  test('handles whitespace and uppercase letters', () => {
    assert.strictEqual(normalizeDomain('   Claude.AI  '), 'claude.ai');
    assert.strictEqual(normalizeDomain('  HTTPS://WEB.WHATSAPP.COM/  '), 'web.whatsapp.com');
  });

  test('handles ports and edge cases gracefully', () => {
    assert.strictEqual(normalizeDomain('localhost:3000'), 'localhost');
    assert.strictEqual(normalizeDomain(''), '');
    assert.strictEqual(normalizeDomain(null), '');
    assert.strictEqual(normalizeDomain(undefined), '');
  });
});

describe('Active Domains Extraction', () => {
  test('extracts only enabled presets', () => {
    const samplePresets = [
      { id: 'yt', name: 'YouTube', domain: 'youtube.com', enabled: true },
      { id: 'gm', name: 'Gmail', domain: 'mail.google.com', enabled: false }
    ];
    const active = getActiveDomains(samplePresets, []);
    assert.deepStrictEqual(active, ['youtube.com']);
  });

  test('merges custom domains (both string and object format)', () => {
    const samplePresets = [
      { id: 'yt', name: 'YouTube', domain: 'youtube.com', enabled: true }
    ];
    const custom = [
      'slack.com',
      { domain: 'community.home-assistant.io', enabled: true },
      { domain: 'disabled.com', enabled: false }
    ];
    const active = getActiveDomains(samplePresets, custom);
    assert.deepStrictEqual(active, ['youtube.com', 'slack.com', 'community.home-assistant.io']);
  });

  test('deduplicates identical domains', () => {
    const presets = [{ id: '1', domain: 'youtube.com', enabled: true }];
    const custom = ['youtube.com', 'https://youtube.com/'];
    const active = getActiveDomains(presets, custom);
    assert.deepStrictEqual(active, ['youtube.com']);
  });
});

describe('URL Matching', () => {
  const activeDomains = ['youtube.com', 'music.youtube.com', 'mail.google.com', 'chatgpt.com'];

  test('matches root domain and subdomains correctly', () => {
    assert.strictEqual(urlMatchesApp('https://youtube.com/watch?v=123', activeDomains), true);
    assert.strictEqual(urlMatchesApp('https://www.youtube.com/feed', activeDomains), true);
    assert.strictEqual(urlMatchesApp('https://music.youtube.com/', activeDomains), true);
    assert.strictEqual(urlMatchesApp('https://mail.google.com/mail/u/0/#inbox', activeDomains), true);
    assert.strictEqual(urlMatchesApp('https://chatgpt.com/c/12345', activeDomains), true);
  });

  test('rejects unrelated domains and domain spoofing / suffix tricks', () => {
    assert.strictEqual(urlMatchesApp('https://notyoutube.com/watch', activeDomains), false);
    assert.strictEqual(urlMatchesApp('https://fakechatgpt.com', activeDomains), false);
    assert.strictEqual(urlMatchesApp('https://google.com/search', activeDomains), false);
  });

  test('rejects non-HTTP schemes and internal browser tabs', () => {
    assert.strictEqual(urlMatchesApp('chrome://settings', activeDomains), false);
    assert.strictEqual(urlMatchesApp('chrome-extension://abcdef/popup.html', activeDomains), false);
    assert.strictEqual(urlMatchesApp('about:blank', activeDomains), false);
    assert.strictEqual(urlMatchesApp('file:///home/user/doc.html', activeDomains), false);
    assert.strictEqual(urlMatchesApp('', activeDomains), false);
    assert.strictEqual(urlMatchesApp(null, activeDomains), false);
  });
});

describe('Tab Filtering & Protection Logic', () => {
  const activeDomains = ['youtube.com', 'mail.google.com'];

  test('filters out non-matching tabs and internal tabs', () => {
    const tabs = [
      { id: 1, url: 'https://youtube.com/watch?v=1', pinned: false, windowId: 10 },
      { id: 2, url: 'https://github.com/kleinbem', pinned: false, windowId: 10 },
      { id: 3, url: 'chrome://extensions', pinned: false, windowId: 10 }
    ];

    const eligible = filterEligibleTabs(tabs, activeDomains);
    assert.strictEqual(eligible.length, 1);
    assert.strictEqual(eligible[0].id, 1);
  });

  test('protects pinned tabs when ignorePinned is true', () => {
    const tabs = [
      { id: 1, url: 'https://mail.google.com/inbox', pinned: true, windowId: 10 },
      { id: 2, url: 'https://youtube.com/feed', pinned: false, windowId: 10 }
    ];

    const eligibleIgnored = filterEligibleTabs(tabs, activeDomains, { ignorePinned: true });
    assert.strictEqual(eligibleIgnored.length, 1);
    assert.strictEqual(eligibleIgnored[0].id, 2);

    const eligibleIncluded = filterEligibleTabs(tabs, activeDomains, { ignorePinned: false });
    assert.strictEqual(eligibleIncluded.length, 2);
  });

  test('excludes tabs that are already in popup windows', () => {
    const popupWindowIds = new Set([99]);
    const tabs = [
      { id: 1, url: 'https://youtube.com/watch', pinned: false, windowId: 10 },
      { id: 2, url: 'https://youtube.com/watch', pinned: false, windowId: 99 }
    ];

    const eligible = filterEligibleTabs(tabs, activeDomains, { popupWindowIds });
    assert.strictEqual(eligible.length, 1);
    assert.strictEqual(eligible[0].id, 1);
  });
});

describe('Presets & Config Integrity', () => {
  test('all default presets have valid IDs, names, and domains', () => {
    assert.ok(DEFAULT_PRESETS.length >= 10);
    const ids = new Set();
    const domains = new Set();

    for (const preset of DEFAULT_PRESETS) {
      assert.ok(preset.id && typeof preset.id === 'string', `Invalid ID: ${preset.id}`);
      assert.ok(preset.name && typeof preset.name === 'string', `Invalid Name: ${preset.name}`);
      assert.ok(preset.domain && typeof preset.domain === 'string', `Invalid Domain: ${preset.domain}`);
      assert.strictEqual(preset.enabled, true);

      assert.ok(!ids.has(preset.id), `Duplicate preset ID: ${preset.id}`);
      assert.ok(!domains.has(preset.domain), `Duplicate preset domain: ${preset.domain}`);
      ids.add(preset.id);
      domains.add(preset.domain);
    }
  });

  test('default configuration has valid properties', () => {
    assert.strictEqual(DEFAULT_CONFIG.windowMode, 'popup');
    assert.strictEqual(DEFAULT_CONFIG.windowScope, 'current');
    assert.strictEqual(DEFAULT_CONFIG.ignorePinnedTabs, true);
    assert.strictEqual(DEFAULT_CONFIG.reuseExistingAppWindow, true);
    assert.ok(Array.isArray(DEFAULT_CONFIG.presets));
    assert.ok(Array.isArray(DEFAULT_CONFIG.customDomains));
  });
});

describe('Smart App Window Reuse', () => {
  const activeDomains = ['youtube.com', 'mail.google.com', 'chatgpt.com'];

  test('identifies an existing native PWA window for the same domain', () => {
    const allWindows = [
      { id: 1, type: 'normal', tabs: [{ id: 101, url: 'https://news.ycombinator.com' }] },
      { id: 2, type: 'app', tabs: [{ id: 102, url: 'https://youtube.com/feed/subscriptions' }] },
      { id: 3, type: 'popup', tabs: [{ id: 103, url: 'https://chatgpt.com/' }] }
    ];

    const result = findExistingAppWindow('https://youtube.com/watch?v=dQw4w9WgXcQ', allWindows, activeDomains);
    assert.ok(result);
    assert.strictEqual(result.window.id, 2);
    assert.strictEqual(result.primaryTab.id, 102);
  });

  test('identifies an existing popup window for the same domain', () => {
    const allWindows = [
      { id: 1, type: 'normal', tabs: [{ id: 101, url: 'https://google.com' }] },
      { id: 3, type: 'popup', tabs: [{ id: 103, url: 'https://chatgpt.com/c/chat1' }] }
    ];

    const result = findExistingAppWindow('https://chatgpt.com/c/chat2', allWindows, activeDomains);
    assert.ok(result);
    assert.strictEqual(result.window.id, 3);
    assert.strictEqual(result.primaryTab.id, 103);
  });

  test('ignores standard browser windows even if domain matches', () => {
    const allWindows = [
      { id: 1, type: 'normal', tabs: [{ id: 101, url: 'https://mail.google.com/mail/u/0/' }] }
    ];

    const result = findExistingAppWindow('https://mail.google.com/mail/u/0/#inbox', allWindows, activeDomains);
    assert.strictEqual(result, null);
  });

  test('returns null if no window matches the domain', () => {
    const allWindows = [
      { id: 2, type: 'app', tabs: [{ id: 102, url: 'https://youtube.com/' }] }
    ];

    const result = findExistingAppWindow('https://mail.google.com/mail/u/0/', allWindows, activeDomains);
    assert.strictEqual(result, null);
  });

  test('handles invalid or empty inputs gracefully', () => {
    assert.strictEqual(findExistingAppWindow('', [], activeDomains), null);
    assert.strictEqual(findExistingAppWindow(null, [], activeDomains), null);
    assert.strictEqual(findExistingAppWindow('https://youtube.com', null, activeDomains), null);
    assert.strictEqual(findExistingAppWindow('chrome://settings', [{ type: 'app', tabs: [] }], activeDomains), null);
  });
});
