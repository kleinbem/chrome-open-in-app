# Chrome Web Store Listing & Quality Documentation

**Extension Name:** Tabs to PWA - 1-Click App Windows  
**Current Version:** 1.1.0  
**Target Platform:** Google Chrome (Manifest V3)  
**Primary Category:** Productivity  
**Last Updated:** 2026-09-16  

---

## 1. Store Listing Details

### Summary (Max 132 characters)
Batch move open Google and web tabs into standalone, frameless PWA app windows or dedicated windows with full toolbar support.

### Detailed Description
Tired of opening YouTube, Gmail, Google Calendar, ChatGPT, or web apps in cluttered browser tabs instead of clean, dedicated windows?

**Tabs to PWA** lets you instantly move all your open web apps and Google PWAs out of the browser tab strip and into standalone application windows with 1 click or a single keyboard shortcut (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>).

#### Key Highlights & Architecture:
* ⚡ **1-Click Batch Popout**: Scans open tabs across your current window or all windows, and detaches matching PWA tabs simultaneously.
* 🛡️ **Handles Many Tabs Gracefully**: Built with an asynchronous, throttled queue engine that spaces window creation to prevent browser freezes, compositor stutter, or window manager lag when moving 20+ tabs.
* 🎛️ **Dual Window Modes**:
  * **Frameless App Mode (Default):** Strips browser navigation, URL bar, and tabs for a distraction-free, pure application feel.
  * **Dedicated Window Mode:** Preserves the browser toolbar, extensions puzzle piece menu, bookmarks, and extension action buttons for users who rely on password managers or ad blockers.
* 🔄 **Zero State Loss**: Reparents active tabs using native Chrome window APIs — active YouTube/audio playback, unsubmitted form inputs, and live socket connections are never interrupted or reloaded.
* ☑️ **Selective Checklist**: Check or uncheck individual tabs with "Select All" / "Deselect All" controls before triggering the move.
* 📊 **Real-Time Progress Bar**: Provides live visual feedback ("Moving tab 3 of 15...") during batch operations.
* ⌨️ **Global Shortcut**: Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> anytime to pop out all matching tabs instantly.
* 🌐 **Built-in Google & Web Presets**: Out-of-the-box support for YouTube, YouTube Music, Gmail, Google Calendar, Google Chat, Meet, Keep, Drive, Maps, Gemini, Google AI Studio, Google Messages, ChatGPT, Claude, WhatsApp Web, and Instagram.
* 🛠️ **Custom Domain Manager**: Easily add any self-hosted service, intranet tool, or web application domain.

---

## 2. Permissions Justifications

The extension requests only the minimum necessary permissions required for its functionality, strictly adhering to the Chrome Web Store Least Privilege policy:

| Permission | Technical Justification |
|---|---|
| `tabs` | Required to query open browser tabs, inspect tab URLs against user-configured PWA domain rules, and pass `tab.id` to `chrome.windows.create` to detach the tab without refreshing or reloading the page. |
| `storage` | Required to persist user preferences (Window Mode, Window Scope, enabled presets, and user-defined custom domains) across browser restarts using `chrome.storage.sync`. |

*Note: No `<all_urls>` host permissions or script injection permissions are requested or required.*

---

## 3. Privacy & Data Use Disclosure

* **Data Collection:** Tabs to PWA does **NOT** collect, log, transmit, or sell any user data, browsing history, URLs, or personal information.
* **Remote Code Execution:** The extension contains zero remote code, zero external CDN scripts, and zero analytics trackers. All code runs 100% locally within the user's browser.
* **Network Requests:** Zero outbound network requests are made.

---

## 4. Version History

* **v1.1.0** (2026-09-16)
  * Implemented throttled async queueing (120–150ms intervals) to handle dozens of open tabs smoothly without browser freezing.
  * Added **Window Style** toggle in Settings: Frameless App Mode vs Dedicated Window with Extension Buttons & Toolbar.
  * Added **Scope Selector** in UI and Settings: Current Window vs All Windows.
  * Added tab selection checklist with Master "Select All" toggle and live progress bar during batch moves.
* **v1.0.0** (2026-09-16)
  * Initial Manifest V3 release with 1-click batch popout, 16 presets, and <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> shortcut.
