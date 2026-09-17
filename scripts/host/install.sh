#!/usr/bin/env bash
set -euo pipefail

# Open in App - Native Messaging Host Installer for Linux
# Installs the helper script and manifests for Chromium-based browsers.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TARGET_BIN="${HOME}/.local/bin/chrome-open-in-app-host"
# Dynamically calculate extension ID matching Chromium unpacked extension derivation
DERIVED_ID=$(python3 -c '
import hashlib
path = "'"${REPO_ROOT}"'"
h = hashlib.sha256(path.encode("utf-8")).hexdigest()[:32]
print("".join([chr(ord("a") + int(c, 16)) for c in h]))
' 2>/dev/null || echo "ngfknlddgkbipaimbaihckmaodkmndoa")

# Build allowed origins list
ORIGINS_SET=()
ORIGINS_SET+=("chrome-extension://${DERIVED_ID}/")
ORIGINS_SET+=("chrome-extension://ngfknlddgkbipaimbaihckmaodkmndoa/")
if [ -n "${1:-}" ]; then
  ORIGINS_SET+=("chrome-extension://${1}/")
fi

# Deduplicate origins
UNIQUE_ORIGINS=($(printf "%s\n" "${ORIGINS_SET[@]}" | sort -u))
ORIGINS_JSON=$(printf '    "%s",\n' "${UNIQUE_ORIGINS[@]}" | sed '$ s/,$//')

echo "Installing Open in App Native Messaging Host (Go binary)..."
echo "Target repo: ${REPO_ROOT}"
echo "Derived Extension ID: ${DERIVED_ID}"

# 1. Build and install executable
mkdir -p "${HOME}/.local/bin"

if command -v go >/dev/null 2>&1 && [ -f "${REPO_ROOT}/host/main.go" ]; then
  echo "Compiling native host from Go source..."
  (cd "${REPO_ROOT}/host" && go build -ldflags="-s -w" -o "${TARGET_BIN}" main.go)
elif [ -f "${REPO_ROOT}/host/chrome-open-in-app-host" ]; then
  cp "${REPO_ROOT}/host/chrome-open-in-app-host" "${TARGET_BIN}"
else
  echo "Error: Neither Go compiler nor prebuilt binary found." >&2
  exit 1
fi

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
${ORIGINS_JSON}
  ]
}
EOF
)

# 3. Install manifest for supported Chromium browsers
TARGET_DIRS=(
  "${HOME}/.config/google-chrome/NativeMessagingHosts"
  "${HOME}/.config/google-chrome-beta/NativeMessagingHosts"
  "${HOME}/.config/google-chrome-unstable/NativeMessagingHosts"
  "${HOME}/.config/chromium/NativeMessagingHosts"
  "${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "${HOME}/.config/BraveSoftware/Brave-Browser-Beta/NativeMessagingHosts"
  "${HOME}/.config/BraveSoftware/Brave-Browser-Nightly/NativeMessagingHosts"
  "${HOME}/.config/microsoft-edge/NativeMessagingHosts"
  "${HOME}/.config/microsoft-edge-beta/NativeMessagingHosts"
  "${HOME}/.config/microsoft-edge-dev/NativeMessagingHosts"
  "${HOME}/.config/vivaldi/NativeMessagingHosts"
  "${HOME}/.config/opera/NativeMessagingHosts"
)

for dir in "${TARGET_DIRS[@]}"; do
  mkdir -p "${dir}"
  echo "${MANIFEST_JSON}" > "${dir}/com.kleinbem.open_in_app.json"
  echo "✓ Installed manifest in ${dir}"
done

echo ""
echo "Installation complete!"
echo "Extension origins authorized:"
for orig in "${UNIQUE_ORIGINS[@]}"; do
  echo "  - ${orig}"
done
echo "Restart Chrome or reload extension to ensure the new native host is recognized."
