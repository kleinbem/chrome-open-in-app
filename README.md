# Tabs to PWA (Chrome Extension)

A lightweight, production-ready Manifest V3 Google Chrome extension that batch-moves open tabs into standalone, frameless PWA/app windows with **1 click** or a single keyboard shortcut (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>).

---

## Highlights

* **1-Click Batch Popout**: Instantly scan open tabs and pop out all matching web apps (Gmail, YouTube, Calendar, Chat, etc.) into their own dedicated, minimal windows.
* **Preserves State**: Uses Chrome's native window creation with `tabId` reparenting — your media playback (audio/video), unsaved form text, and WebSocket sessions are **never reloaded or lost**.
* **Global Shortcut**: Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> anytime to convert all eligible tabs in your active window without even opening the extension menu.
* **Preloaded Presets**: Out-of-the-box support for Google PWAs (YouTube, YouTube Music, Gmail, Calendar, Chat, Meet, Keep, Drive, Maps, Gemini, AI Studio, Messages) and popular web apps (ChatGPT, Claude, WhatsApp Web, Instagram).
* **Fully Customizable**: Toggle any presets and add your own custom domains (e.g. self-hosted tools, internal dashboards, Home Assistant, GitHub).

---

## Installation (Unpacked in Chrome)

1. Open Google Chrome.
2. Navigate to `chrome://extensions` in the address bar.
3. Toggle on **Developer mode** in the top-right corner.
4. Click the **Load unpacked** button.
5. Select this folder:
   ```
   /home/martin/Develop/github.com/kleinbem/chrome-tabs-to-pwa
   ```
6. (Optional) Pin **Tabs to PWA** to your Chrome toolbar for instant 1-click access.

---

## Usage

### Method 1: Extension Popup
1. Click the **Tabs to PWA** icon in your Chrome toolbar.
2. The popup displays all currently open tabs that match your enabled PWA rules.
3. Click **"Move All to PWA Windows"** to detach all of them at once, or click the popout icon next to any individual tab.

### Method 2: Keyboard Shortcut
* Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> at any time.
* All matching tabs in your active Chrome window will immediately pop out into clean standalone windows.
* You can customize this shortcut anytime at `chrome://extensions/shortcuts`.

---

## Adding Custom Domains

1. Click the **Tabs to PWA** toolbar icon.
2. Click the **Settings (gear)** icon in the header.
3. In the **Custom Domains** input, type a domain (e.g., `community.home-assistant.io` or `github.com`) and click **Add**.
4. Any tab opened with that domain will now be detected and eligible for 1-click PWA window popout.

---

## Technical Architecture

* **Manifest Version:** 3 (`service_worker` background script).
* **Permissions:**
  * `tabs`: Required to detect open tab URLs and titles, and reparent `tab.id`.
  * `storage`: Used to persist user settings and custom domain configurations.
* **Window Mechanism:** Uses `chrome.windows.create({ tabId, type: 'popup' })` to detach live browser tabs into frameless application windows without URL bars or tab bars.
