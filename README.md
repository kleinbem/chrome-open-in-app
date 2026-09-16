# Open in App (Chrome Extension)

A high-performance, production-ready Manifest V3 Google Chrome extension that batch-moves open tabs into standalone app windows or dedicated windows with full toolbar support — with **1 click**, a right-click context menu, or a global keyboard shortcut (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>).

---

## What's New in v1.4.0

* 🚀 **Native PWA Launching via `chrome.management`**: Automatically detects installed Progressive Web Apps (YouTube, Gmail, Calendar, etc.) and launches them through Chromium's native app manager (`chrome.management.launchApp`). This ensures the OS window manager assigns the native `StartupWMClass`, displaying the app with its real icon and name on the Linux/Windows taskbar or dock!
* 🪟 **Window Type Filter Correction**: Fixed window queries to query `windowTypes: ['normal', 'popup', 'app']` across all service worker APIs. Running PWA windows (`type: 'app'`) are now fully visible, allowing instantaneous window reuse, tab updating, and focus switching.
* 🎯 **Precise Multi-Tab Targeting**: When reusing a multi-tab PWA window, the extension targets the specific matching tab.
* 🧪 **38 Automated Tests**: All unit tests and security audits passing (`npm test`, 100% test coverage for matchers and sinks).
* 📜 **Changelog**: Comprehensive release notes maintained in [`CHANGELOG.md`](CHANGELOG.md).

---

## Key Features

* **1-Click Batch Open**: Instantly scans open tabs and opens all matching web apps (Gmail, YouTube, Calendar, Chat, etc.) into their own dedicated windows.
* **Smooth Multi-Tab Throttling**: Batch-moves 20, 50, or 100+ tabs without stuttering or freezing Chrome using an asynchronous spaced queue.
* **Dual Window Modes**:
  * **Frameless App Mode (Default):** Clean, distraction-free app-like windows without URL bars or tabs.
  * **Dedicated Window Mode:** Preserves the browser toolbar, bookmarks bar, extensions puzzle piece menu, and extension buttons for users who rely on password managers or ad blockers.
* **Window Scope Selector**: Toggle between **Current Window** and **All Windows** with a single click.
* **Selective Tab Checklist**: Select or uncheck specific tabs before moving, plus a master "Select All" toggle.
* **Real-time Progress Bar**: Visual feedback displaying move progress in real time.
* **Preserves Live State**: Uses native tab reparenting — your media playback (audio/video), unsaved form text, and active sessions are **never interrupted or reloaded**.
* **Global Shortcut**: Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> anytime to convert all eligible tabs according to your saved preferences.
* **Preloaded Presets**: Out-of-the-box support for Google Apps (YouTube, YouTube Music, Gmail, Calendar, Chat, Meet, Keep, Drive, Maps, Gemini, AI Studio, Messages) and popular web apps (ChatGPT, Claude, WhatsApp Web, Instagram).
* **Custom Domain Manager**: Add any custom domain or self-hosted service (e.g. Home Assistant, internal dashboards, GitHub).

---

## Installation (Unpacked in Chrome)

1. Open Google Chrome.
2. Navigate to `chrome://extensions` in the address bar.
3. Toggle on **Developer mode** in the top-right corner.
4. Click the **Load unpacked** button.
5. Select this directory:
   ```
   /home/martin/Develop/github.com/kleinbem/chrome-open-in-app
   ```
6. (Optional) Pin **Open in App** to your Chrome toolbar for quick access.

---

## Usage

### 1. The Extension Popup
1. Click the **Open in App** icon in your Chrome toolbar.
2. Choose your scope: **[ Current Window ]** or **[ All Windows ]**.
3. Review the detected tabs. Check or uncheck any tabs you want to open.
4. Click **"Open Selected in App (N)"** to detach them all, or click the individual popout icon next to any single tab.

### 2. Context Menus
* **On any page:** Right-click anywhere on the page and select **"Open this Tab in App Window"**.
* **On the extension icon:** Right-click the **Open in App** icon in your toolbar and select **"Open All Matching Tabs in App Windows"**.

### 3. Global Keyboard Shortcut
* Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> at any time.
* All matching tabs will be opened in app windows according to your saved Scope, Window Mode, and Pinned Tab preferences.
* You can customize this shortcut anytime at `chrome://extensions/shortcuts`.

---

## Automated Tests

Run the unit test suite at any time:

```bash
npm test
```

The test suite runs via Node.js native test runner (`node --test`) in ~150ms with zero external dependencies. It verifies:
* Domain normalization and protocol stripping
* Subdomain and root domain URL matching
* Pinned tab protection logic
* Popup window exclusion logic
* Preset schema and configuration integrity

---

## Technical Architecture

* **Manifest Version:** 3 (`service_worker` background script with `type: "module"`).
* **Permissions:**
  * `tabs`: Required to detect open tab URLs and titles, and reparent `tab.id`.
  * `storage`: Used to persist user settings, mode, scope, and custom domain configurations across sessions.
  * `contextMenus`: Used to provide right-click single-tab and batch-tab actions.
* **Window Mechanism:** Uses `chrome.windows.create({ tabId, type: windowMode })` with adaptive pacing to safely detach live browser tabs into standalone windows without reloading.
