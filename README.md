# Open in App (Chrome Extension)

A high-performance, production-ready Manifest V3 Google Chrome extension that batch-moves open tabs into standalone app windows or dedicated windows with full toolbar support — with **1 click**, a right-click context menu, or a global keyboard shortcut (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>).

---

## What's New in v1.5.0

* 🌐 **100% Dynamic PWA Architecture**: Completely eliminated all hardcoded preset lists, static app catalogs, and opinionated defaults. The extension discovers installed desktop PWAs on-the-fly directly from your OS (`~/.local/share/applications/`) and Chromium's web app registry.
* 🛡️ **Selective PWA Control**: Disable individual detected PWAs via Settings toggles (`disabledInstalledAppIds`) without needing to uninstall them from your desktop.
* 🚀 **Cross-Browser & Compositor Support**: First-class support for Google Chrome, Brave, Microsoft Edge, Chromium, Vivaldi, and Opera. Full Wayland compatibility for KDE Plasma (panel icon grouping) and Hyprland (assigns `class: chrome-<appId>-Default` for easy window rules).
* ⚡ **Optimized Native Messaging**: Detached non-blocking process launching (`cmd.Start`), opt-in debug logging (`OPEN_IN_APP_DEBUG=1`), and persistent storage caching in `chrome.storage.local`.
* 🧪 **46 Automated Tests**: Complete test coverage (`npm test`) across domain normalizers, URL matching, PWA detection, and prototype pollution defenses.
* 📜 **Changelog**: Comprehensive release notes maintained in [`CHANGELOG.md`](CHANGELOG.md).

---

## Key Features

* **Dynamic PWA Discovery**: Automatically detects what PWAs are *actually installed on your machine* and offers 1-click batch detached app windows.
* **Custom Domain Manager**: Add any custom intranet, self-hosted (Home Assistant, Grafana, Portainer), or arbitrary web app domain.
* **1-Click Batch Open**: Instantly scans open tabs and opens all matching web apps into their own dedicated windows.
* **Smooth Multi-Tab Throttling**: Batch-moves 20, 50, or 100+ tabs without stuttering or freezing Chrome using an asynchronous spaced queue.
* **Dual Window Modes**:
  * **Frameless App Mode (Default):** Clean, distraction-free app-like windows without URL bars or tabs.
  * **Dedicated Window Mode:** Preserves the browser toolbar, bookmarks bar, extensions puzzle piece menu, and extension buttons for users who rely on password managers or ad blockers.
* **Window Scope Selector**: Toggle between **Current Window** and **All Windows** with a single click.
* **Selective Tab Checklist**: Select or uncheck specific tabs before moving, plus a master "Select All" toggle.
* **Real-time Progress Bar**: Visual feedback displaying move progress in real time.
* **Preserves Live State**: Uses native tab reparenting — your media playback (audio/video), unsaved form text, and active sessions are **never interrupted or reloaded**.
* **Global Shortcut**: Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> anytime to convert all eligible tabs according to your saved preferences.

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
