# Chrome Web Store Listing — Open in App

> Last Updated: 2026-09-16

## Store Listing

**Extension Name** [REQUIRED]
Open in App - Move Tabs to App Windows

**Short Description** [REQUIRED]
Batch move open Google and web tabs into standalone app windows or dedicated windows with full toolbar support.

**Detailed Description** [REQUIRED]
Tired of opening YouTube, Gmail, Google Calendar, ChatGPT, or web apps in cluttered browser tabs instead of clean, dedicated windows?

Open in App gives you the missing Chrome superpower: batch-moving all your open web apps and Google tabs out of the tab strip and into standalone application windows with 1 click, right-click context menus, or a single keyboard shortcut (Alt + Shift + P).

Key Highlights & Architecture:
- 1-Click Batch Open: Scans open tabs across your current window or all windows, and opens matching tabs into separate windows simultaneously.
- Context Menu Integration: Right-click on any page to open that tab into an app window, or right-click the extension icon to trigger a full batch move.
- Pinned Tab Protection: Automatically preserves pinned tabs so your permanently docked tabs are never accidentally moved.
- Dynamic Badge Counter: Live badge on the extension icon shows exactly how many app tabs are open in your browser.
- Smooth Multi-Tab Throttling: Built with an asynchronous, throttled queue engine that spaces window creation to prevent browser freezes, compositor stutter, or window manager lag when moving 20+ tabs.
- Dual Window Modes:
  * Frameless App Mode (Default): Strips browser navigation, URL bar, and tabs for a distraction-free, pure application feel.
  * Dedicated Window Mode: Preserves the browser toolbar, extensions puzzle piece menu, bookmarks, and extension action buttons for users who rely on password managers or ad blockers.
- Zero State Loss: Reparents active tabs using native Chrome window APIs — active YouTube/audio playback, unsubmitted form inputs, and live socket connections are never interrupted or reloaded.
- Selective Checklist: Check or uncheck individual tabs with "Select All" / "Deselect All" controls before triggering the move.
- Real-Time Progress Bar: Provides live visual feedback ("Opening tab 3 of 15...") during batch operations.
- Global Shortcut: Press Alt + Shift + P anytime to pop out all matching tabs instantly.
- Built-in Google & Web Presets: Out-of-the-box support for YouTube, YouTube Music, Gmail, Google Calendar, Google Chat, Meet, Keep, Drive, Maps, Gemini, Google AI Studio, Google Messages, ChatGPT, Claude, WhatsApp Web, and Instagram.
- Custom Domain Manager: Easily add any self-hosted service, intranet tool, or web application domain.

How to use it:
1. Click the "Open in App" icon in your Chrome toolbar.
2. Select your scope (Current Window or All Windows).
3. Review the matching tabs detected by the extension.
4. Click "Open Selected in App" to move them into standalone windows.
5. Alternatively, press Alt + Shift + P anytime to move all eligible tabs instantly.

Privacy & Permissions:
Open in App does NOT track, collect, transmit, or sell any personal data, browsing history, or website content. All processing runs 100% locally on your machine.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Batch-move open web applications and Google tabs from browser tab strips into standalone application windows or dedicated toolbar windows.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename / Note |
|---|---|---|---|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Extension Icons | 16×16 & 48×48 PNG | ✅ Ready | `icons/icon-16.png`, `icons/icon-48.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | 🟡 Prepared | Main popup showing detected app tabs & scope selector |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Prepared | Settings drawer with Frameless App Mode vs Dedicated Window Mode |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Prepared | Context menu integration ("Open this Tab in App Window") |
| Small Promo Tile [RECOMMENDED] | 440×280 PNG | ⬜ Optional | Promo banner for Chrome Web Store promotion |

---

## Permissions Justification

The extension requests only the minimum necessary permissions required for its functionality, strictly adhering to the Chrome Web Store Least Privilege policy:

| Permission | Type | Technical Justification |
|---|---|---|
| `tabs` | permissions | Required to inspect open tab URLs against user-configured app domain rules (e.g. `mail.google.com`) and obtain `tab.id` to reparent tabs into new windows without page reload. Cannot use `activeTab` alone because the core feature requires inspecting and batch-processing background/inactive tabs across the window. |
| `storage` | permissions | Required to persist user preferences (Window Mode, Window Scope, Pinned Tab Protection, enabled presets, and custom domain rules) across browser sessions and synchronize them across the user's signed-in Chrome browsers via `chrome.storage.sync`. |
| `contextMenus` | permissions | Required to provide right-click context menu options: "Open this Tab in App Window" on web pages, and "Open All Matching Tabs in App Windows" on the extension action icon. |

*Note: No `<all_urls>` host permissions or script injection permissions (`scripting`) are requested or required.*

---

## Privacy & Data Use

### Data Collection
**Does the extension collect user data?** No

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|---|---|---|---|---|
| Personally identifiable info | No | No | N/A | No |
| Health info | No | No | N/A | No |
| Financial info | No | No | N/A | No |
| Authentication info | No | No | N/A | No |
| Personal communications | No | No | N/A | No |
| Location | No | No | N/A | No |
| Web history | No | No | N/A | No |
| User activity | No | No | N/A | No |
| Website content | No | No | N/A | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

### Account & Cloud Storage Disclosure
User settings and preferences (Window Mode, Scope, custom domains) are persisted locally and synchronized across the user's signed-in Chrome browsers using Google's native `chrome.storage.sync` API. No data is transmitted to external servers, analytics providers, or third-party entities.

---

## Distribution

* **Visibility:** Public
* **Regions:** All regions
* **Pricing:** Free

---

## Developer Info

* **Publisher Name:** kleinbem
* **Support URL:** https://github.com/kleinbem/chrome-open-in-app/issues
* **Homepage URL:** https://github.com/kleinbem/chrome-open-in-app

---

## Version History

| Version | Date | Changes | Status |
|---|---|---|---|
| **1.2.0** | 2026-09-16 | Added context menus, dynamic badge counter, pinned tab protection, modular `utils/matcher.js`, automated unit & security tests, GitHub Actions CI/release automation. | Draft |
| **1.1.0** | 2026-09-16 | Rebranded to Open in App, throttled multi-tab mover, dual window modes (Frameless App vs Dedicated Window), scope selector, tab checklist with progress bar. | Internal |
| **1.0.0** | 2026-09-16 | Initial Manifest V3 implementation with 1-click batch popout, 16 presets, and Alt+Shift+P shortcut. | Internal |

---

## Review Notes

### Single Purpose Compliance
The extension strictly adheres to the Single Purpose policy: its single and exclusive purpose is to detach and organize open web app tabs into standalone application windows.

### Known Edge Cases Handled
* **Internal Tabs:** Tabs with URLs like `chrome://`, `chrome-extension://`, `devtools://`, `edge://`, `about:blank` are strictly ignored and never detached.
* **Already Detached Windows:** Tabs already residing in popup windows (`type: "popup"`) are automatically excluded to prevent redundant window creation loops.
* **Compositor Lag & Heavy Tab Sets:** Batch moves space window creation by 100–150ms using an asynchronous throttled queue to ensure Chrome does not freeze or drop frames when moving 20+ tabs.
