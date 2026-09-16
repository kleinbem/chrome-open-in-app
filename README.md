# Open in App (Chrome Extension)

A high-performance, production-ready Manifest V3 Google Chrome extension that batch-moves open tabs into standalone app windows or dedicated windows with full toolbar support — with **1 click** or a single keyboard shortcut (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>).

---

## Why "Open in App"?

Google Chrome natively uses the term **"Open in app"** (seen in the Omnibox icon and the tab right-click menu) rather than technical jargon like "PWA". 

While Chrome only allows opening tabs into apps **one by one**, this extension gives you the missing feature: **a 1-click batch action to open all eligible tabs across your browser into their dedicated app windows at once.**

---

## Features

* ⚡ **1-Click Batch Open**: Instantly scans open tabs and opens all matching web apps (Gmail, YouTube, Calendar, Chat, etc.) into their own dedicated windows.
* 🛡️ **Smooth Multi-Tab Throttling**: Batch-moves 20, 50, or 100+ tabs without stuttering or freezing Chrome using an asynchronous spaced queue.
* 🎛️ **Dual Window Modes**:
  * **Frameless App Mode (Default):** Clean, distraction-free app-like windows without URL bars or tabs.
  * **Dedicated Window Mode:** Preserves the browser toolbar, bookmarks bar, extensions puzzle piece menu, and extension buttons for users who rely on extensions.
* 🎯 **Window Scope Selector**: Toggle between **Current Window** and **All Windows** with a single click.
* ☑️ **Selective Tab Checklist**: Select or uncheck specific tabs before moving, plus a master "Select All" toggle.
* 📊 **Real-time Progress Bar**: Visual feedback displaying move progress in real time.
* 🔄 **Preserves Live State**: Uses native tab reparenting — your media playback (audio/video), unsaved form text, and active sessions are **never interrupted or reloaded**.
* ⌨️ **Global Shortcut**: Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> anytime to convert all eligible tabs according to your saved preferences.
* 🌐 **Preloaded Presets**: Out-of-the-box support for Google Apps (YouTube, YouTube Music, Gmail, Calendar, Chat, Meet, Keep, Drive, Maps, Gemini, AI Studio, Messages) and popular web apps (ChatGPT, Claude, WhatsApp Web, Instagram).
* 🛠️ **Custom Domain Manager**: Add any custom domain or self-hosted service (e.g. Home Assistant, internal dashboards, GitHub).

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

### 2. Global Keyboard Shortcut
* Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> at any time.
* All matching tabs will be opened in app windows according to your saved Scope and Window Mode preferences.
* You can customize this shortcut anytime at `chrome://extensions/shortcuts`.

### 3. Choosing Window Style
* Open the popup and click the **Settings (gear)** icon.
* Under **Window Style**, select:
  * **Frameless App Mode**: For clean, distraction-free player/app windows.
  * **Dedicated Window**: If you need access to your extensions (ad blockers, password managers) and navigation controls.

---

## Technical Architecture

* **Manifest Version:** 3 (`service_worker` background script).
* **Permissions:**
  * `tabs`: Required to detect open tab URLs and titles, and reparent `tab.id`.
  * `storage`: Used to persist user settings, mode, scope, and custom domain configurations across sessions.
* **Window Mechanism:** Uses `chrome.windows.create({ tabId, type: windowMode })` with pacing to safely detach live browser tabs into standalone windows without reloading.
