#!/bin/bash
set -euo pipefail

#──────────────────────────────────────────────────────────
# Watermark — macOS Build, Sign, Notarize & DMG Script
#──────────────────────────────────────────────────────────
#
# Prerequisites:
#   1. Apple Developer ID certificate installed in Keychain
#   2. Environment variables set (see below)
#   3. gon installed: brew install Bearer/tap/gon
#   4. create-dmg installed: brew install create-dmg
#
# Required environment variables:
#   APPLE_ID      — Apple ID email (for notarization)
#   AC_PASSWORD   — App-specific password (appleid.apple.com → Security → App-Specific Passwords)
#   AC_PROVIDER   — Team ID (from Apple Developer portal, e.g. "AB1234CD56")
#
# Usage:
#   ./build/build-macos.sh           # Full build + sign + notarize + DMG
#   ./build/build-macos.sh --skip-notarize   # Build + sign + DMG (no notarize)
#   ./build/build-macos.sh --unsigned        # Build + DMG only (no sign)
#──────────────────────────────────────────────────────────

APP_NAME="Watermark"
APP_PATH="./build/bin/${APP_NAME}.app"
DMG_PATH="./build/bin/Watermark.dmg"
ENTITLEMENTS="./build/darwin/entitlements.plist"
GON_CONFIG="./build/darwin/gon-sign.json"
ICON_PATH="./build/darwin/iconfile.icns"
SIGNING_IDENTITY="Developer ID Application: Kezlo98"

SKIP_NOTARIZE=false
UNSIGNED=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --skip-notarize) SKIP_NOTARIZE=true ;;
        --unsigned)      UNSIGNED=true ;;
        --help|-h)
            echo "Usage: ./build/build-macos.sh [--skip-notarize] [--unsigned]"
            echo ""
            echo "  --skip-notarize   Build + sign + DMG without notarization"
            echo "  --unsigned        Build + DMG without signing or notarization"
            exit 0
            ;;
    esac
done

echo "═══════════════════════════════════════════════════"
echo "  🌊 Watermark — macOS Build Pipeline"
echo "═══════════════════════════════════════════════════"

# ── Step 1: Build the Wails app ──────────────────────
echo ""
echo "🔨 Step 1/4: Building Wails app..."
wails3 package
echo "   ✅ Built: ${APP_PATH}"

# ── Step 2: Code Signing ─────────────────────────────
if [ "$UNSIGNED" = false ]; then
    echo ""
    echo "🔏 Step 2/4: Code signing..."

    # Sign with entitlements and hardened runtime (required for notarization)
    codesign --deep --force --verbose \
        --options runtime \
        --entitlements "${ENTITLEMENTS}" \
        --sign "${SIGNING_IDENTITY}" \
        "${APP_PATH}"

    echo "   ✅ Signed with: ${SIGNING_IDENTITY}"

    # Verify signature
    codesign --verify --verbose "${APP_PATH}"
    echo "   ✅ Signature verified"
else
    echo ""
    echo "⏭️  Step 2/4: Skipping code signing (--unsigned)"

    # Ad-hoc sign for local use
    codesign --force --deep --sign - "${APP_PATH}"
    echo "   ✅ Ad-hoc signed for local use"
fi

# ── Step 3: Notarization ─────────────────────────────
if [ "$UNSIGNED" = false ] && [ "$SKIP_NOTARIZE" = false ]; then
    echo ""
    echo "📦 Step 3/4: Notarizing with Apple..."

    if [ -z "${APPLE_ID:-}" ] || [ -z "${AC_PASSWORD:-}" ] || [ -z "${AC_PROVIDER:-}" ]; then
        echo "   ❌ Error: APPLE_ID, AC_PASSWORD and AC_PROVIDER must be set"
        echo "   Export them before running:"
        echo "     export APPLE_ID='your@email.com'"
        echo "     export AC_PASSWORD='your-app-specific-password'"
        echo "     export AC_PROVIDER='YOUR_TEAM_ID'"
        exit 1
    fi

    # Use gon for notarization if available, otherwise use xcrun directly
    if command -v gon &> /dev/null; then
        echo "   Using gon..."
        gon "${GON_CONFIG}"
    else
        echo "   Using xcrun notarytool..."

        # Create a ZIP for notarization submission
        NOTARIZE_ZIP="./build/bin/${APP_NAME}-notarize.zip"
        ditto -c -k --keepParent "${APP_PATH}" "${NOTARIZE_ZIP}"

        xcrun notarytool submit "${NOTARIZE_ZIP}" \
            --apple-id "${APPLE_ID}" \
            --team-id "${AC_PROVIDER}" \
            --password "${AC_PASSWORD}" \
            --wait

        # Staple the notarization ticket
        xcrun stapler staple "${APP_PATH}"

        # Cleanup
        rm -f "${NOTARIZE_ZIP}"
    fi

    echo "   ✅ Notarization complete"
else
    echo ""
    echo "⏭️  Step 3/4: Skipping notarization"
fi

# ── Step 4: Create DMG ───────────────────────────────
echo ""
echo "💿 Step 4/4: Creating DMG..."

# Remove existing DMG
rm -f "${DMG_PATH}"

create-dmg \
    --volname "Watermark" \
    --volicon "${ICON_PATH}" \
    --window-pos 200 120 \
    --window-size 660 400 \
    --icon-size 100 \
    --icon "${APP_NAME}.app" 180 170 \
    --hide-extension "${APP_NAME}.app" \
    --app-drop-link 480 170 \
    "${DMG_PATH}" \
    "${APP_PATH}"

echo "   ✅ DMG created: ${DMG_PATH}"

# ── Summary ──────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Build complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  📦 App:  ${APP_PATH}"
echo "  💿 DMG:  ${DMG_PATH}"
echo "  📏 Size: $(du -h "${DMG_PATH}" | cut -f1)"
echo ""

if [ "$UNSIGNED" = true ]; then
    echo "  ⚠️  Unsigned build — for local development only"
elif [ "$SKIP_NOTARIZE" = true ]; then
    echo "  ⚠️  Signed but not notarized — Gatekeeper may block on other Macs"
else
    echo "  🎉 Signed + notarized — ready for distribution!"
fi
echo ""
