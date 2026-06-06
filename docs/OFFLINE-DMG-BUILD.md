# First DMG — Signed macOS Installer (Apple Silicon)

The exact path from a clean repo to a **signed, notarized `.dmg`** that installs
on a clean Apple-Silicon Mac with no Gatekeeper warning. Do `OFFLINE-MAC-BUILD-
STEPS.md` steps 0–4 first (toolchain, headless proof, staged sidecars, dev run).

## Prerequisites
- Apple Developer account + a **Developer ID Application** certificate in your
  login keychain.
- An app-specific password for `notarytool` (appleid.apple.com → Sign-In & Security).

## 1. Generate icons
```bash
npx tauri icon path/to/vantora-retail-1024.png   # → src-tauri/icons/*
```

## 2. (Optional) updater keys for P7
```bash
npx tauri signer generate -w src-tauri/updater-key
# paste the PUBLIC key into tauri.conf.json plugins.updater.pubkey, set active=true
export TAURI_SIGNING_PRIVATE_KEY="$(cat src-tauri/updater-key)"
```

## 3. Build + sign + notarize (one command)
```bash
export KAKO_EDITION=retail
export APPLE_SIGNING_IDENTITY="Developer ID Application: <Your Name> (<TEAMID>)"
export APPLE_ID="you@apple.com"
export APPLE_TEAM_ID="TEAMID"
export APPLE_APP_PASSWORD="abcd-efgh-ijkl-mnop"   # app-specific

scripts/release/mac.sh
```

`mac.sh` does, in order:
1. stage arm64 sidecars into `src-tauri/{binaries,resources}`,
2. `tauri build` (KAKO_OFFLINE=1) → `.app` + `.dmg`,
3. **deep-sign every Mach-O** in the bundle (postgres, postgrest, node, dylibs)
   with hardened runtime + `entitlements.plist` — Gatekeeper kills any unsigned
   sidecar, so this step is mandatory,
4. `notarytool submit --wait` then `stapler staple` the `.dmg` and `.app`.

## 4. Output
```
src-tauri/target/release/bundle/dmg/VANTORA_0.1.0_aarch64.dmg
```

## 5. Verify on a CLEAN Mac (no dev tools)
```bash
spctl -a -vvv "/Applications/VANTORA.app"   # → accepted, source=Notarized Developer ID
```
- Double-click the DMG → drag to Applications → launch: **no Gatekeeper prompt**.
- App boots the local stack, you can log in and make a cash + installment sale,
  print, Backup/restore — confirm **no network** after launch (`nettop`/Little Snitch).

## Other editions
```bash
KAKO_EDITION=pharmacy   scripts/release/mac.sh     # VANTORA Pharmacy.dmg
KAKO_EDITION=restaurant scripts/release/mac.sh
KAKO_EDITION=fmcg       scripts/release/mac.sh
```
Same core, different brand/icons/bundle-id — no code change (edition descriptor).

## Common pitfalls
- *“app is damaged / can’t be opened”* → a bundled binary wasn’t signed; re-run
  step 3 (the deep-sign loop) and confirm `codesign --verify --deep` passes.
- *notarization “Invalid”* → check the log: `xcrun notarytool log <id> ...`;
  usually a missing hardened-runtime flag or an unsigned nested binary.
