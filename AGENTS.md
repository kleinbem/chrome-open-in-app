# AGENTS.md — chrome-tabs-to-pwa

Guidance for AI assistants working in this repository.

## Overview

`chrome-tabs-to-pwa` is a Manifest V3 Google Chrome extension that batch-moves open tabs into standalone, frameless PWA application windows (`type: 'popup'`) with 1 click or a keyboard shortcut (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>).

## Layout

| Path | What lives here |
|---|---|
| `manifest.json` | Manifest V3 specification with `tabs` and `storage` permissions. |
| `background.js` | Service worker handling keyboard commands, window detachment, and messaging. |
| `popup/` | Popup UI (`popup.html`, `popup.css`, `popup.js`). |
| `icons/` | Application icons (16x16, 48x48, 128x128 PNGs). |
| `CHROMEWEBSTORE.md` | Chrome Web Store listing metadata and permissions justifications. |

## Conventions

- **Manifest V3 only**: All background tasks run in `background.js` as an ephemeral service worker.
- **State persistence**: Never store state in in-memory global variables in the service worker; use `chrome.storage.sync` or `chrome.storage.local`.
- **Async/Await**: Always use `async`/`await` for Chrome Extension APIs, never `.then()` chains.
- **Chrome Windows API**: Note that `chrome.windows` does NOT have a `.query()` method — use `getAll`, `getLastFocused`, or `getCurrent`.
- **Preserve tab state**: Always detach using `chrome.windows.create({ tabId: tab.id, type: 'popup' })` rather than reloading or navigating a new URL.
