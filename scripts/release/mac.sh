#!/usr/bin/env bash
# ============================================================================
# macOS release: build → sign (app + EVERY bundled binary) → notarize → staple
# ----------------------------------------------------------------------------
#   KAKO_EDITION=retail \
#   APPLE_SIGNING_IDENTITY="Developer ID Application: Acme (TEAMID)" \
#   APPLE_ID=you@acme.com APPLE_TEAM_ID=TEAMID APPLE_APP_PASSWORD=app-specific \
#   scripts/release/mac.sh
#
# Gatekeeper kills any UNSIGNED bundled binary (postgres/postgrest/node), so we
# deep-sign every Mach-O under the bundle, then notarize the whole .app/.dmg.
# Run on macOS with Xcode CLT + the Tauri toolchain.
# ============================================================================
set -euo pipefail
EDITION="${KAKO_EDITION:-retail}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

: "${APPLE_SIGNING_IDENTITY:?set APPLE_SIGNING_IDENTITY (Developer ID Application)}"

echo "› staging sidecars (arm64)"
"$ROOT/scripts/offline/macos/fetch-binaries.sh" arm64

echo "› tauri build (edition=$EDITION)"
KAKO_OFFLINE=1 KAKO_EDITION="$EDITION" npx tauri build

APP_DIR="$ROOT/src-tauri/target/release/bundle/macos"
APP="$(find "$APP_DIR" -maxdepth 1 -name '*.app' | head -1)"
echo "› deep-signing every Mach-O in $APP"
# Sign nested binaries first (inside-out), then the app, with hardened runtime.
find "$APP" -type f \( -perm -u+x -o -name '*.dylib' \) | while read -r f; do
  codesign --force --options runtime --timestamp \
    --entitlements "$ROOT/src-tauri/entitlements.plist" \
    --sign "$APPLE_SIGNING_IDENTITY" "$f" || true
done
codesign --force --options runtime --timestamp \
  --entitlements "$ROOT/src-tauri/entitlements.plist" \
  --sign "$APPLE_SIGNING_IDENTITY" "$APP"

DMG="$(find "$APP_DIR" -maxdepth 1 -name '*.dmg' | head -1)"
if [[ -n "${APPLE_ID:-}" && -n "${APPLE_TEAM_ID:-}" && -n "${APPLE_APP_PASSWORD:-}" ]]; then
  echo "› notarizing $DMG"
  xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_PASSWORD" --wait
  xcrun stapler staple "$DMG"
  xcrun stapler staple "$APP"
else
  echo "⚠ notarization skipped (set APPLE_ID/APPLE_TEAM_ID/APPLE_APP_PASSWORD)"
fi
echo "✓ macOS artifact ready: $DMG"
