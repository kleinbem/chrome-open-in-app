#!/usr/bin/env bash
set -euo pipefail

# Open in App - Native Messaging Host Installer for Linux
# Installs the helper script and manifests for Chromium-based browsers.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_BIN="${HOME}/.local/bin/chrome-open-in-app-host"
EXTENSION_ID="${1:-ngfknlddgkbipaimbaihckmaodkmndoa}"

echo "Installing Open in App Native Messaging Host..."

# 1. Install executable
mkdir -p "${HOME}/.local/bin"
cp "${SCRIPT_DIR}/chrome-open-in-app-host" "${TARGET_BIN}"
chmod +x "${TARGET_BIN}"
echo "✓ Installed host executable to ${TARGET_BIN}"

# 2. Prepare manifest
MANIFEST_JSON=$(cat <<EOF
{
  "name": "com.kleinbem.open_in_app",
  "description": "Native Host for Open in App Chrome Extension",
  "path": "${TARGET_BIN}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXTENSION_ID}/"
  ]
}
EOF
)

# 3. Install manifest for supported Chromium browsers
TARGET_DIRS=(
  "${HOME}/.config/google-chrome/NativeMessagingHosts"
  "${HOME}/.config/chromium/NativeMessagingHosts"
  "${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "${HOME}/.config/microsoft-edge/NativeMessagingHosts"
)

for dir in "${TARGET_DIRS[@]}"; do
  mkdir -p "${dir}"
  echo "${MANIFEST_JSON}" > "${dir}/com.kleinbem.open_in_app.json"
  echo "✓ Installed manifest in ${dir}"
done

echo ""
echo "Installation complete!"
echo "Extension ID authorized: ${EXTENSION_ID}"
echo "Restart Chrome to ensure the new native host is recognized."
