# Chrome Web Store Metadata — Tabs to PWA

## Listing Information

- **Extension Name:** Tabs to PWA - 1-Click App Windows
- **Short Description (max 132 chars):** Batch move open Google and web tabs into standalone, frameless PWA app windows with a single click or keyboard shortcut.
- **Detailed Description:**
  Tired of opening YouTube, Gmail, Google Calendar, or ChatGPT in cluttered browser tabs instead of dedicated app windows?
  
  **Tabs to PWA** lets you instantly move all your open web apps and Google PWAs out of the tab strip and into clean, frameless, standalone application windows with just 1 click or a single keyboard shortcut.

  **Key Features:**
  - ⚡ **1-Click Batch Popout:** Scans all open tabs and detaches matching PWA apps into separate windows simultaneously.
  - 🔄 **Preserves Full State:** Video playback, audio, unsubmitted forms, and ongoing sessions are never interrupted or reloaded.
  - ⌨️ **Global Shortcut:** Press Alt+Shift+P anytime to instantly pop out all matching tabs in your active window.
  - 🌐 **Preconfigured Google & Popular PWAs:** Works out-of-the-box with YouTube, YouTube Music, Gmail, Google Calendar, Google Chat, Meet, Keep, Drive, Maps, Gemini, Google AI Studio, Claude, ChatGPT, WhatsApp Web, and Instagram.
  - 🛠️ **Custom Domain Manager:** Easily add any custom domain or self-hosted app.
  - 🔒 **Privacy-First:** Zero data collection, no analytics, no external servers.

- **Category:** Productivity
- **Primary Language:** English

## Permissions Justification

| Permission | Purpose & Technical Justification |
|---|---|
| `tabs` | Required to query open browser tabs, inspect their URLs against configured PWA domains, and pass `tab.id` to `chrome.windows.create` to detach the tab into an app window without reloading. |
| `storage` | Used to save user preferences, enabled/disabled preset web apps, and user-defined custom domains across browser sessions. |

## Privacy Policy & Data Use

- **Data Collection:** Tabs to PWA does **NOT** collect, store, or transmit any personally identifiable information, browsing history, or user data.
- **Remote Code:** No remote code or dynamic script evaluation is used.
- **Network Requests:** The extension makes zero external network requests.
