import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDomain,
  getActiveDomains,
  urlMatchesApp,
  matchDomainOrSubdomain,
  filterEligibleTabs,
  findExistingAppWindow,
  findMatchingInstalledApp,
  groupTabsByApp,
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

  test('matches domains with or without www prefix interchangeably', () => {
    assert.strictEqual(urlMatchesApp('https://amazon.ie/dp/12345', ['www.amazon.ie']), true);
    assert.strictEqual(urlMatchesApp('https://www.amazon.ie/dp/12345', ['amazon.ie']), true);
    assert.strictEqual(urlMatchesApp('https://smile.amazon.ie/dp/12345', ['www.amazon.ie']), true);
    assert.strictEqual(urlMatchesApp('https://fake-amazon.ie/dp/12345', ['www.amazon.ie']), false);
    assert.strictEqual(matchDomainOrSubdomain('amazon.ie', 'www.amazon.ie'), true);
    assert.strictEqual(matchDomainOrSubdomain('www.amazon.ie', 'amazon.ie'), true);
    assert.strictEqual(matchDomainOrSubdomain('smile.amazon.ie', 'www.amazon.ie'), true);
    assert.strictEqual(matchDomainOrSubdomain('other.com', 'www.amazon.ie'), false);
  });

  test('rejects unrelated domains and domain spoofing / suffix tricks', () => {
    assert.strictEqual(urlMatchesApp('https://notyoutube.com/watch', activeDomains), false);
    assert.strictEqual(urlMatchesApp('https://fakechatgpt.com', activeDomains), false);
    assert.strictEqual(urlMatchesApp('https://google.com/search', activeDomains), false);
  });

  test('matches Google Captcha / Sorry redirect pages destined for active app', () => {
    const sorryUrl = 'https://www.google.com/sorry/index?continue=https://gemini.google.com/app/12345&q=EgRUywm';
    assert.strictEqual(urlMatchesApp(sorryUrl, ['gemini.google.com']), true);
    assert.strictEqual(urlMatchesApp(sorryUrl, ['youtube.com']), false);
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
  test('default configuration has clean initial state with zero forced presets', () => {
    assert.deepStrictEqual(DEFAULT_PRESETS, []);
    assert.strictEqual(DEFAULT_CONFIG.windowMode, 'popup');
    assert.strictEqual(DEFAULT_CONFIG.windowScope, 'current');
    assert.strictEqual(DEFAULT_CONFIG.ignorePinnedTabs, true);
    assert.strictEqual(DEFAULT_CONFIG.reuseExistingAppWindow, true);
    assert.ok(Array.isArray(DEFAULT_CONFIG.presets));
    assert.strictEqual(DEFAULT_CONFIG.presets.length, 0); // No static presets forced
    assert.ok(Array.isArray(DEFAULT_CONFIG.disabledInstalledAppIds));
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
    assert.strictEqual(result.isExactMatch, false);
  });

  test('accurately flags isExactMatch as true for identical URLs', () => {
    const allWindows = [
      { id: 2, type: 'app', tabs: [{ id: 102, url: 'https://youtube.com/feed/subscriptions/' }] }
    ];

    const result = findExistingAppWindow('https://youtube.com/feed/subscriptions', allWindows, activeDomains);
    assert.ok(result);
    assert.strictEqual(result.window.id, 2);
    assert.strictEqual(result.isExactMatch, true);
  });

  test('distinguishes different hash routes in SPAs like Gmail as non-exact matches', () => {
    const allWindows = [
      { id: 2, type: 'app', tabs: [{ id: 102, url: 'https://mail.google.com/mail/u/0/#inbox' }] }
    ];

    const result = findExistingAppWindow('https://mail.google.com/mail/u/0/#inbox/thread123', allWindows, activeDomains);
    assert.ok(result);
    assert.strictEqual(result.window.id, 2);
    assert.strictEqual(result.isExactMatch, false);
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
    assert.strictEqual(result.isExactMatch, false);
  });

  test('ignores standard browser windows even if domain matches', () => {
    const allWindows = [
      { id: 1, type: 'normal', tabs: [{ id: 101, url: 'https://mail.google.com/mail/u/0/' }] }
    ];

    const result = findExistingAppWindow('https://mail.google.com/mail/u/0/#inbox', allWindows, activeDomains);
    assert.strictEqual(result, null);
  });

  test('precisely selects matching tab in multi-tab app windows', () => {
    const allWindows = [
      {
        id: 5,
        type: 'app',
        tabs: [
          { id: 201, url: 'https://news.ycombinator.com' },
          { id: 202, url: 'https://youtube.com/watch?v=1' },
          { id: 203, url: 'https://reddit.com' }
        ]
      }
    ];

    const result = findExistingAppWindow('https://youtube.com/watch?v=2', allWindows, activeDomains);
    assert.ok(result);
    assert.strictEqual(result.window.id, 5);
    assert.strictEqual(result.primaryTab.id, 202);
  });

  test('prioritizes genuine PWA (type: "app") over generic popup (type: "popup")', () => {
    const allWindows = [
      { id: 10, type: 'popup', tabs: [{ id: 501, url: 'https://youtube.com/watch?v=oldPopup' }] },
      { id: 20, type: 'app', tabs: [{ id: 502, url: 'https://youtube.com/feed/subscriptions' }] }
    ];

    const result = findExistingAppWindow('https://youtube.com/watch?v=newVideo', allWindows, activeDomains);
    assert.ok(result);
    assert.strictEqual(result.window.id, 20);
    assert.strictEqual(result.primaryTab.id, 502);
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

describe('Installed PWA Detection & Launch Matching', () => {
  const mockInstalledApps = [
    {
      id: 'agimnkijcaahngcdmfeangaknmldooml',
      name: 'YouTube',
      type: 'hosted_app',
      appLaunchUrl: 'https://www.youtube.com/',
      enabled: true
    },
    {
      id: 'fmgjjmmmlfnkbppncabfkddbjimcfncm',
      name: 'Gmail',
      type: 'hosted_app',
      appLaunchUrl: 'https://mail.google.com/mail/installwebapp?usp=chrome_default',
      enabled: true
    },
    {
      id: 'disabled_app_id',
      name: 'Disabled App',
      type: 'hosted_app',
      appLaunchUrl: 'https://disabled.com/',
      enabled: false
    },
    {
      id: 'extension_id',
      name: 'AdBlocker',
      type: 'extension',
      enabled: true
    },
    {
      id: 'custom_pwa_id',
      name: 'Internal Dashboard',
      type: 'packaged_app',
      appLaunchUrl: 'https://dash.internal.corp/app',
      enabled: true
    }
  ];

  test('matches installed PWA by appLaunchUrl', () => {
    const match = findMatchingInstalledApp('https://www.youtube.com/watch?v=dQw4w9WgXcQ', mockInstalledApps);
    assert.ok(match);
    assert.strictEqual(match.id, 'agimnkijcaahngcdmfeangaknmldooml');
    assert.strictEqual(match.name, 'YouTube');
  });

  test('matches installed PWA with query params in launch URL', () => {
    const match = findMatchingInstalledApp('https://mail.google.com/mail/u/0/#inbox', mockInstalledApps);
    assert.ok(match);
    assert.strictEqual(match.id, 'fmgjjmmmlfnkbppncabfkddbjimcfncm');
  });

  test('matches custom packaged/hosted app', () => {
    const match = findMatchingInstalledApp('https://dash.internal.corp/reports', mockInstalledApps);
    assert.ok(match);
    assert.strictEqual(match.id, 'custom_pwa_id');
  });

  test('ignores disabled apps', () => {
    const match = findMatchingInstalledApp('https://disabled.com/page', mockInstalledApps);
    assert.strictEqual(match, null);
  });

  test('ignores standard browser extensions even if enabled', () => {
    const match = findMatchingInstalledApp('chrome-extension://extension_id/options.html', mockInstalledApps);
    assert.strictEqual(match, null);
  });

  test('matches dynamic OS desktop PWA by domains array', () => {
    const desktopPwas = [
      {
        id: 'gdfaincndogidkdcdkhapmbffkckdkhn',
        name: 'Google Gemini',
        startupWmClass: 'crx_gdfaincndogidkdcdkhapmbffkckdkhn',
        domains: ['gemini.google.com']
      },
      {
        id: 'cadlkienfkclaiaibeoongdcgmdikeeg',
        name: 'ChatGPT',
        startupWmClass: 'crx_cadlkienfkclaiaibeoongdcgmdikeeg',
        domains: ['chatgpt.com']
      }
    ];

    const geminiMatch = findMatchingInstalledApp('https://gemini.google.com/app/12345', desktopPwas);
    assert.ok(geminiMatch);
    assert.strictEqual(geminiMatch.id, 'gdfaincndogidkdcdkhapmbffkckdkhn');
    assert.strictEqual(geminiMatch.name, 'Google Gemini');

    const chatgptMatch = findMatchingInstalledApp('https://chatgpt.com/c/chat123', desktopPwas);
    assert.ok(chatgptMatch);
    assert.strictEqual(chatgptMatch.id, 'cadlkienfkclaiaibeoongdcgmdikeeg');
  });

  test('getActiveDomains dynamically incorporates domains from installed PWAs and respects disabledAppIds', () => {
    const desktopPwas = [
      { id: 'custom_pwa', name: 'Custom PWA', domains: ['mycompany.internal.app'] },
      { id: 'disabled_pwa', name: 'Disabled PWA', domains: ['disabled.internal.app'] }
    ];
    const active = getActiveDomains([], [], desktopPwas, ['disabled_pwa']);
    assert.ok(active.includes('mycompany.internal.app'));
    assert.ok(!active.includes('disabled.internal.app'));
  });

  test('ignores installed apps where openInWindow is false', () => {
    const appsWithWindowFlags = [
      {
        id: 'fmgjjmmmlfnkbppncabfkddbjimcfncm',
        name: 'Gmail (Tab Shortcut)',
        domains: ['mail.google.com'],
        openInWindow: false,
        enabled: true
      },
      {
        id: 'agimnkijcaahngcdmfeangaknmldooml',
        name: 'YouTube',
        domains: ['youtube.com'],
        openInWindow: true,
        enabled: true
      }
    ];

    // findMatchingInstalledApp ignores openInWindow: false
    assert.strictEqual(findMatchingInstalledApp('https://mail.google.com/mail/u/0/', appsWithWindowFlags), null);
    const yt = findMatchingInstalledApp('https://youtube.com/watch?v=1', appsWithWindowFlags);
    assert.ok(yt);
    assert.strictEqual(yt.id, 'agimnkijcaahngcdmfeangaknmldooml');

    // getActiveDomains filters out openInWindow: false
    const active = getActiveDomains([], [], appsWithWindowFlags, []);
    assert.ok(active.includes('youtube.com'));
    assert.ok(!active.includes('mail.google.com'));
  });

  test('returns null when no installed app matches URL', () => {
    const match = findMatchingInstalledApp('https://news.ycombinator.com', mockInstalledApps);
    assert.strictEqual(match, null);
  });

  test('handles malformed, non-HTTP, and prototype poison inputs safely', () => {
    assert.strictEqual(findMatchingInstalledApp('', mockInstalledApps), null);
    assert.strictEqual(findMatchingInstalledApp(null, mockInstalledApps), null);
    assert.strictEqual(findMatchingInstalledApp('javascript:alert(1)', mockInstalledApps), null);
    assert.strictEqual(findMatchingInstalledApp('https://__proto__', mockInstalledApps), null);
    assert.strictEqual(findMatchingInstalledApp('https://youtube.com', null), null);
    assert.strictEqual(findMatchingInstalledApp('https://youtube.com', []), null);
  });
});

describe('Tab Grouping by App', () => {
  const activeDomains = ['youtube.com', 'claude.ai', 'chatgpt.com', 'app.slack.com'];
  const sampleTabs = [
    { id: 1, url: 'https://www.youtube.com/watch?v=1', title: 'Video 1', favIconUrl: 'https://youtube.com/fav.ico' },
    { id: 2, url: 'https://claude.ai/chat/123', title: 'Claude Chat', favIconUrl: 'https://claude.ai/fav.ico' },
    { id: 3, url: 'https://www.youtube.com/watch?v=2', title: 'Video 2', favIconUrl: 'https://youtube.com/fav.ico' },
    { id: 4, url: 'https://chatgpt.com/c/abc', title: 'ChatGPT Chat', favIconUrl: '' },
    { id: 5, url: 'https://app.slack.com/client/T1', title: 'Slack General', favIconUrl: 'https://slack.com/fav.ico' },
    { id: 6, url: 'https://www.youtube.com/watch?v=3', title: 'Video 3', favIconUrl: 'https://youtube.com/fav.ico' }
  ];

  test('groups tabs by matched installed PWA or domain and sorts by count descending', () => {
    const installedApps = [
      { id: 'yt', name: 'YouTube', domains: ['youtube.com'] },
      { id: 'claude', name: 'Claude', domains: ['claude.ai'] },
      { id: 'chatgpt', name: 'ChatGPT', domains: ['chatgpt.com'] },
      { id: 'slack', name: 'Slack', domains: ['app.slack.com'] }
    ];
    const groups = groupTabsByApp(sampleTabs, activeDomains, [], installedApps);
    assert.strictEqual(groups.length, 4);

    // Largest group first (YouTube with 3 tabs)
    assert.strictEqual(groups[0].name, 'YouTube');
    assert.strictEqual(groups[0].tabs.length, 3);
    assert.deepStrictEqual(groups[0].tabs.map((t) => t.id), [1, 3, 6]);

    // Other groups have 1 tab each
    const names = groups.slice(1).map((g) => g.name).sort();
    assert.deepStrictEqual(names, ['ChatGPT', 'Claude', 'Slack']);
  });

  test('groups tabs with or without www under installed PWA', () => {
    const tabs = [
      { id: 10, url: 'https://amazon.ie/dp/item1', title: 'Amazon Item 1' },
      { id: 11, url: 'https://www.amazon.ie/dp/item2', title: 'Amazon Item 2' }
    ];
    const installed = [
      { id: 'ndccmjlnaibhkkpkjlkhegjliobijdhg', name: 'Amazon IE', domains: ['www.amazon.ie', 'amazon.ie'] }
    ];
    const groups = groupTabsByApp(tabs, ['amazon.ie', 'www.amazon.ie'], [], installed);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].name, 'Amazon IE');
    assert.strictEqual(groups[0].tabs.length, 2);
  });

  test('handles custom domains without preset metadata', () => {
    const customTabs = [
      { id: 10, url: 'https://custom-tool.internal.corp/dashboard', title: 'Internal Tool' }
    ];
    const groups = groupTabsByApp(customTabs, ['custom-tool.internal.corp'], []);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].name, 'Custom-tool');
    assert.strictEqual(groups[0].domain, 'custom-tool.internal.corp');
  });

  test('returns empty array on empty or invalid inputs', () => {
    assert.deepStrictEqual(groupTabsByApp([], activeDomains), []);
    assert.deepStrictEqual(groupTabsByApp(null, activeDomains), []);
    assert.deepStrictEqual(groupTabsByApp(undefined, activeDomains), []);
  });
});

