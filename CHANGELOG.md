# Changelog

All notable changes to the **Open in App** Chrome extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.5.2] — 2026-09-21

### Fixed
* **Filter Out Chrome Apps Without "Open as Window"**: Chrome allows defining web apps and desktop shortcuts with or without the "Open as window" setting (`user_display_mode: BROWSER` vs `STANDALONE`/`TABBED`). Launching `--app-id` on apps created without "Open as window" causes Chromium to open them inside a regular browser tab rather than an app window. The native host now inspects Chromium's `user_display_mode` metadata in LevelDB records and filters out tab-only shortcuts, ensuring only genuine standalone windowed PWAs are offered for app detachment.
* **Open-in-Window Property Propagation**: Surface `openInWindow: true` on discovered `PWAInfo` objects and add defensive validation across `getActiveDomains()`, `findMatchingInstalledApp()`, and `groupTabsByApp()`.

---

## [1.5.1] — 2026-09-17

### Fixed
* **PWA Domain Resolution for Gemini, Claude, and Shortcut-less PWAs**: Resolved an issue where PWAs installed without explicit shortcut actions in their `.desktop` file (such as Google Gemini, Claude, and ChatGPT) had empty domain lists and fell back to launching generic popup windows rather than true native PWAs (`--app-id=...`).
* **Chromium Deterministic App ID Derivation**: Implemented Chromium's exact double-SHA256 nibble-encoding algorithm in Go (`generateAppID`) to mathematically derive App IDs directly from web app URLs (e.g. `https://gemini.google.com/app` -> `gdfaincndogidkdcdkhapmbffkckdkhn`).
* **Multi-Profile & LevelDB PWA Discovery**: Dynamically scans `web_apps.daily_metrics` in browser preferences and Chromium Sync LevelDB records across all profiles (including custom `--user-data-dir` profiles).
* **Browser Profile Preservation**: Propagates `--user-data-dir` and `--profile-directory` from desktop launchers so PWAs run in their native profile container.
* **Go Unit Test Suite**: Added automated tests in `host/main_test.go` covering App ID hashing, PWA desktop file discovery, and URL matching.

---

## [1.5.0] — 2026-09-17

### Changed
* **100% Dynamic PWA Architecture**: Completely eliminated all hardcoded presets, static app lists, and opinionated catalogs. The extension now discovers installed desktop PWAs on-the-fly from the user's OS (`~/.local/share/applications/`) and Chrome management API.
* **Streamlined UI**: Replaced the static catalog with a clean view of auto-detected installed PWAs, selective per-app toggles, and user-defined custom domains.

### Added
* **Selective App Disabling**: Users can toggle off specific auto-detected PWAs in Settings (`disabledInstalledAppIds`) without uninstalling the desktop app from their operating system.
* **Broadened Chromium & Compositor Support**:
  * Native messaging host support extended across all major Chromium browsers: Google Chrome (Stable/Beta/Unstable), Chromium, Brave (Stable/Beta/Nightly), Microsoft Edge (Stable/Beta/Dev), Vivaldi, and Opera.
  * Native host dynamically identifies parent process (`/proc/$PPID/exe` and cmdline) to invoke the exact running browser binary.
  * Full native compatibility with KDE Plasma and Wayland compositors like Hyprland (assigns native `app_id` / `class: chrome-<appId>-Default` for window rules and Waybar/taskbar icons).
* **Cross-Compiled Native Host Binaries**: Rebuilt host binaries with enhanced browser resolution and process detection.

---

## [1.4.0] — 2026-09-16

### Added
* **Native PWA Launch via `chrome.management`**: Automatically detects installed Progressive Web Apps (YouTube, Gmail, Calendar, etc.) and launches them through Chromium's native app manager (`chrome.management.launchApp`). This instructs Chromium to set the native OS `StartupWMClass` (Wayland/X11), allowing the app to appear on the Linux/Windows taskbar with its genuine icon and title, separate from Google Chrome!
* **Window Type Filter Correction**: Explicitly specified `windowTypes: ['normal', 'popup', 'app']` across all `chrome.windows.getAll()` and `getLastFocused()` calls. Previously, Chromium's default filter omitted `type: 'app'` windows, preventing the extension from detecting and reusing open PWA windows.
* **Precise Tab Targeting**: In multi-tab app windows, `findExistingAppWindow()` now targets the domain-matched tab rather than arbitrarily falling back to the first tab.
* **Automated Test Expansion**: Added 8 new unit tests in `tests/matcher.test.js` covering `findMatchingInstalledApp()`, URL matching against installed apps, disabled app handling, and prototype pollution defenses (38/38 tests passing).

---

## [1.3.0] — 2026-09-16

### Added
* **Smart App Window Reuse**: Automatically detects if an installed PWA or app window for that domain is already open (`win.type === 'app'` or `'popup'`). It brings the existing window to the front, navigates it to the tab's URL, and closes the duplicate browser tab.
* **App Window Reuse Setting**: New toggle in the Settings drawer (**"Reuse Existing App Windows"**, enabled by default) allowing users to switch between reusing existing windows or always opening new ones.
* **Dynamic Versioning**: Popup footer now dynamically reads and displays `chrome.runtime.getManifest().version` instead of a static string.
* **Startup Diagnostics**: Added clear console tags (`[Open in App v1.3.0] Background Service Worker active` and `[Open in App v1.3.0] Popup UI initialized`) for immediate verification in Chrome DevTools.
* **Automated Unit Tests**: Added 5 new tests in `tests/matcher.test.js` validating `findExistingAppWindow()` against native PWAs, popup windows, and browser windows (30/30 tests passing).

---

## [1.2.0] — 2026-09-16

### Added
* **Context Menu Integration**: Right-click on any page background → *"Open this Tab in App Window"*; right-click extension toolbar icon → *"Open All Matching Tabs in App Windows"*.
* **Dynamic Badge Counter**: Live toolbar badge displays real-time count of matching app tabs currently open in the browser.
* **Pinned Tab Protection**: Toggle in Settings (enabled by default) to prevent permanently docked pinned tabs from being moved during batch operations.
* **Modular Engine**: Refactored core domain matching and normalization logic into `utils/matcher.js`.
* **Automated Test Suite**: Native Node 22 test runner (`npm test`) covering domain normalization, URL matching, and protection logic.
* **Hardened Security Defenses**: Added prototype pollution defenses (`__proto__`, `constructor`, `prototype` sanitization), strict `http:`/`https:` protocol whitelisting, and static audits against dangerous sinks (`eval`, `new Function`).
* **CI/CD Automation**: Added GitHub Actions workflows for continuous integration (`ci.yaml`) and automated CWS release packaging (`release.yaml`).

---

## [1.1.0] — 2026-09-16

### Changed
* **Rebranding**: Renamed extension to **Open in App**, matching Google Chrome's native UI terminology.

### Added
* **Throttled Batch Engine**: Asynchronous queueing mechanism (100–150ms intervals) that spaces window creation to eliminate browser compositor stutter, window manager lag, and freezes when moving 20+ tabs.
* **Dual Window Modes**:
  * **Frameless App Mode (Default)**: Clean minimalist window without URL bar or tab strip.
  * **Dedicated Window Mode**: Preserves browser toolbars, bookmarks, extension action buttons, and puzzle piece menu.
* **Window Scope Selector**: Toggle between **Current Window** and **All Windows** directly from the popup header.
* **Selective Tab Checklist**: Per-tab checkboxes with a master "Select All" / "Deselect All" control.
* **Real-time Progress Bar**: Animated live progress indicator during batch tab moves.
* **DOM XSS Elimination**: Completely eliminated all `.innerHTML` usage in favor of secure `document.createElement()` and `.textContent` DOM construction.

---

## [1.0.0] — 2026-09-16

### Added
* **Initial Manifest V3 Release**: Ephemeral service worker background script (`"type": "module"`).
* **1-Click Batch Popout**: Scans open tabs against app rules and detaches matching tabs into separate windows.
* **Global Keyboard Shortcut**: <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> to batch-convert all matching tabs.
* **16 Built-in Presets**: Out-of-the-box support for YouTube, YouTube Music, Gmail, Google Calendar, Chat, Meet, Keep, Drive, Maps, Gemini, AI Studio, Messages, ChatGPT, Claude, WhatsApp Web, and Instagram.
* **Custom Domain Manager**: Add and manage custom web app domains with `chrome.storage.sync` persistence.
* **Pure PNG Icons**: Real 16×16, 48×48, and 128×128 pixel-perfect icons.
