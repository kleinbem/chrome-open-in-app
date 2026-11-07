# AGENTS.md — chrome-open-in-app

Guidance for AI assistants working in this repository.

## Overview

`chrome-open-in-app` is a Manifest V3 Google Chrome extension that batch-moves open tabs into standalone app windows or dedicated browser windows with full toolbar support, matching Chrome's native "Open in app" feature. Triggerable via 1-click popup or global keyboard shortcut (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>).

## Layout

| Path | What lives here |
|---|---|
| `manifest.json` | Manifest V3 specification with `tabs` and `storage` permissions. |
| `background.js` | Service worker handling keyboard commands, throttled window detachment, and messaging. |
| `popup/` | Popup UI (`popup.html`, `popup.css`, `popup.js`). |
| `icons/` | Application icons (16x16, 48x48, 128x128 PNGs). |
| `utils/matcher.js` | Core domain normalization, URL pattern matching, and tab filtering logic. |
| `tests/` | Node 22 native unit and security test suites (`npm test`). |
| `CHROMEWEBSTORE.md` | Chrome Web Store listing metadata and permissions justifications. |

## Chrome Team Guidance & Agent Conventions

This repository adheres to Google Chrome's official guide for AI coding assistants: [Build extensions with coding agents](https://developer.chrome.com/docs/extensions/ai/build-with-ai#modern_web_guidance) and the **Modern Web Guidance** skills pack.

### Core Architectural Rules
- **Manifest V3 only**: All background tasks run in `background.js` as an ephemeral service worker (`"type": "module"`).
- **Ephemeral service worker**: Never store state in in-memory global variables in the service worker; always persist in `chrome.storage.sync` or `chrome.storage.local`.
- **Async/Await**: Always use `async`/`await` for Chrome Extension APIs, never `.then()` chains.
- **Chrome Windows API**: Note that `chrome.windows` does NOT have a `.query()` method — use `getAll`, `getLastFocused`, or `getCurrent`.
- **Preserve tab state**: Always detach using `chrome.windows.create({ tabId: tab.id, type: windowMode })` rather than reloading or navigating a new URL.
- **DOM XSS Immunity**: Never use `.innerHTML` or `eval()`. Construct DOM dynamically using `document.createElement()` and `.textContent`.
- **Strict Protocol Enforcement**: Only match and process `http:` and `https:` URLs; reject `javascript:`, `data:`, `file:`, `chrome:`.

### CHROMEWEBSTORE.md Maintenance
Per Google Chrome Developer documentation, **whenever you are creating or making changes to this extension, always maintain and update `CHROMEWEBSTORE.md`**:
1. Keep the permissions justification table synchronized with `manifest.json`.
2. Update the feature list and Version History on new capabilities.
3. Ensure single-purpose policy declarations and privacy disclosures match active code.

### Browser Testing with Chrome DevTools MCP
To test the extension live in Chrome using AI agents:
1. Enable remote debugging in Chrome at `chrome://inspect/#remote-debugging` ("Allow remote debugging for this browser instance").
2. Configure the Chrome DevTools MCP server with:
   ```json
   {
     "mcpServers": {
       "chrome-devtools-mcp": {
         "command": "npx",
         "args": ["-y", "chrome-devtools-mcp@latest", "--categoryExtensions", "--autoConnect"]
       }
     }
   }
   ```
3. Use Chrome DevTools tools to inspect extension surfaces (`popup`, `background.js`), trigger actions, and verify live window detaches.
