# ============================================================================
# Fetch + stage the Windows sidecar binaries (P2).
# ----------------------------------------------------------------------------
# Stages PostgreSQL 17 (bin/lib/share) + PostgREST + Node into src-tauri/ for
# Tauri's externalBin/resources. Run on Windows before tauri build.
#
#   pwsh scripts/offline/windows/fetch-binaries.ps1
# ============================================================================
$ErrorActionPreference = "Stop"
$Triple = "x86_64-pc-windows-msvc"
$Root   = Resolve-Path "$PSScriptRoot/../../.."
$Bin    = Join-Path $Root "src-tauri/binaries"
$Res    = Join-Path $Root "src-tauri/resources"
New-Item -ItemType Directory -Force -Path $Bin, "$Res/pgsql", "$Res/scripts/offline", "$Res/migrations" | Out-Null

Write-Host "> staging app scripts + migrations into resources"
Copy-Item "$Root/scripts/offline/*" "$Res/scripts/offline/" -Recurse -Force
Copy-Item "$Root/supabase/migrations/*" "$Res/migrations/" -Recurse -Force
Copy-Item "$Root/supabase/ci" "$Res/ci" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host @"
NEXT STEPS (manual, documented for the Windows build):
  1. PostgreSQL 17 (x64, EnterpriseDB zip): copy bin/ + lib/ + share/ into $Res/pgsql/
     then: Copy-Item "$Res/pgsql/bin/postgres.exe" "$Bin/postgres-$Triple.exe"
  2. PostgREST (windows x64 release): Copy-Item postgrest.exe "$Bin/postgrest-$Triple.exe"
  3. Node: Copy-Item (Get-Command node).Source "$Bin/node-$Triple.exe"
  4. Code-sign every staged .exe in scripts/release/windows.ps1.

KAKO_PG_BIN should point at $Res/pgsql/bin at runtime (set by the shell).
"@
