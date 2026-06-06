# Build & Verify the Offline App — Windows 10/11 (x64)

Exact steps for Windows. The codebase + offline scripts are shared with macOS;
only the toolchain, sidecar binaries, and signing differ. Run in **PowerShell**.

## 0. Prerequisites (one-time)

```powershell
winget install OpenJS.NodeJS.LTS            # Node 22
winget install Rustlang.Rustup              # Rust → then: rustup default stable
winget install Microsoft.VisualStudio.2022.BuildTools   # MSVC + Windows SDK (signtool)
npm i -g @tauri-apps/cli

git clone <repo> ; cd Kako
git checkout claude/clinic-project-continuation-PqxGD
npm ci
```

## 1. Prove the headless offline stack (no Tauri yet)

```powershell
# PostgreSQL 17 (for binaries): EnterpriseDB installer or:
winget install PostgreSQL.PostgreSQL.17
$env:KAKO_PG_BIN = "C:\Program Files\PostgreSQL\17\bin"
$env:KAKO_OFFLINE = "1"; $env:KAKO_EDITION = "retail"

npm run offline:verify     # → ✓ offline runtime verification PASSED
npm run offline:cert       # → ✓ RECOVERY CERTIFIED (regenerates the report, OS=win32 x64)
npm run offline:bootstrap  # first real store (admin@kako.local / admin)
```

> Windows has no `runuser`; the scripts run Postgres as your normal user
> directly (no `KAKO_PG_RUNAS` needed).

## 2. Stage the x64 sidecars

```powershell
scripts\offline\windows\fetch-binaries.ps1
# Then, as it prints:
#  - copy PG17 bin/lib/share        → src-tauri\resources\pgsql\
#  - Copy-Item resources\pgsql\bin\postgres.exe  src-tauri\binaries\postgres-x86_64-pc-windows-msvc.exe
#  - download PostgREST (win x64)    → src-tauri\binaries\postgrest-x86_64-pc-windows-msvc.exe
#  - Copy-Item (Get-Command node).Source → src-tauri\binaries\node-x86_64-pc-windows-msvc.exe
```

## 3. Generate icons + (optional) updater keys

```powershell
npx tauri icon path\to\vantora-retail-1024.png            # → src-tauri\icons\*
npx tauri signer generate -w src-tauri\updater-key         # P7 updater (optional)
# put the printed PUBLIC key into tauri.conf.json plugins.updater.pubkey, set active=true
```

## 4. Dev run (unsigned)

```powershell
$env:KAKO_OFFLINE = "1"; $env:KAKO_EDITION = "retail"
npm run build
npx tauri dev
```

**Expected:** window appears after the stack is healthy; log in, make a cash +
installment sale, print an 80mm receipt, Backup Now, restore — all offline.

## 5. Produce the signed installer → see `OFFLINE-EXE-BUILD.md`.

## 6. Report back
Send the `OFFLINE-RECOVERY-CERTIFICATION.md` regenerated on `win32 x64` and
whether the dev run worked. I'll fold results into P2 finalization.
