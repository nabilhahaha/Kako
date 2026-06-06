# First EXE/MSI — Signed Windows Installer (x64)

From a clean repo to a **code-signed** NSIS `.exe` (and/or `.msi`) that installs
on a clean Windows 10/11 machine. Do `OFFLINE-WINDOWS-BUILD-STEPS.md` steps 0–4
first (toolchain, headless proof, staged sidecars, dev run). Run in PowerShell.

## Prerequisites
- A code-signing certificate (`.pfx`) — ideally an **EV** cert (best SmartScreen
  reputation). `signtool.exe` from the Windows SDK on PATH.

## 1. Generate icons
```powershell
npx tauri icon path\to\vantora-retail-1024.png   # → src-tauri\icons\*
```

## 2. (Optional) updater keys for P7
```powershell
npx tauri signer generate -w src-tauri\updater-key
# paste the PUBLIC key into tauri.conf.json plugins.updater.pubkey, set active=true
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content src-tauri\updater-key -Raw
```

## 3. Build + sign (one command)
```powershell
$env:KAKO_EDITION = "retail"
$env:SIGN_PFX = "C:\path\to\cert.pfx"
$env:SIGN_PFX_PASSWORD = "<pfx-password>"

pwsh scripts\release\windows.ps1
```

`windows.ps1` does:
1. stage x64 sidecars into `src-tauri\{binaries,resources}`,
2. `tauri build` (KAKO_OFFLINE=1) → NSIS `.exe` (+ `.msi` if configured),
3. **`signtool sign`** every bundled `.exe`/`.msi` (postgres, postgrest, node,
   installer) with SHA-256 + RFC-3161 timestamp.

## 4. Output
```
src-tauri\target\release\bundle\nsis\VANTORA_0.1.0_x64-setup.exe
```

## 5. Verify on a CLEAN Windows machine
```powershell
Get-AuthenticodeSignature ".\VANTORA_0.1.0_x64-setup.exe"   # → Valid
```
- Run the installer: with an EV cert there is **no SmartScreen block** (a new
  standard cert may show SmartScreen until reputation builds — expected).
- App boots the local stack; log in, cash + installment sale, print, Backup/
  restore — confirm no network after launch (Resource Monitor).

## Other editions
```powershell
$env:KAKO_EDITION="pharmacy";   pwsh scripts\release\windows.ps1
$env:KAKO_EDITION="restaurant"; pwsh scripts\release\windows.ps1
$env:KAKO_EDITION="fmcg";       pwsh scripts\release\windows.ps1
```

## Common pitfalls
- *SmartScreen “unrecognized app”* on a new standard cert → expected; use an EV
  cert or let reputation accrue. Not a signing failure.
- *Sidecar fails to start after install* → confirm `postgres-x86_64-pc-windows-
  msvc.exe` + the full `resources\pgsql` tree shipped; check `%PROGRAMDATA%\Kako\
  run\postgres.log`.
- *Port in use* → an existing local Postgres on 5432 is fine (offline uses 54329);
  override via `KAKO_OFFLINE_PG_PORT` if needed.
