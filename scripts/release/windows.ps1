# ============================================================================
# Windows release: build → code-sign installer + every bundled .exe
# ----------------------------------------------------------------------------
#   $env:KAKO_EDITION="retail"
#   $env:SIGN_PFX="C:\path\cert.pfx"; $env:SIGN_PFX_PASSWORD="..."
#   pwsh scripts/release/windows.ps1
#
# SmartScreen reputation builds over time on a new EV cert. Run on Windows with
# the Tauri toolchain + signtool (Windows SDK).
# ============================================================================
$ErrorActionPreference = "Stop"
$Edition = if ($env:KAKO_EDITION) { $env:KAKO_EDITION } else { "retail" }
$Root = Resolve-Path "$PSScriptRoot/.."  | Split-Path -Parent

Write-Host "> staging sidecars (x64)"
& "$Root/scripts/offline/windows/fetch-binaries.ps1"

Write-Host "> tauri build (edition=$Edition)"
$env:KAKO_OFFLINE = "1"; $env:KAKO_EDITION = $Edition
npx tauri build

if (-not $env:SIGN_PFX) { Write-Warning "SIGN_PFX not set — skipping code-signing"; exit 0 }

$bundleDir = Join-Path $Root "src-tauri/target/release"
$targets = Get-ChildItem -Path $bundleDir -Recurse -Include *.exe, *.msi |
  Where-Object { $_.FullName -match "bundle|binaries|\.exe$" }
foreach ($t in $targets) {
  Write-Host "> signing $($t.FullName)"
  signtool sign /f $env:SIGN_PFX /p $env:SIGN_PFX_PASSWORD `
    /tr http://timestamp.digicert.com /td sha256 /fd sha256 $t.FullName
}
Write-Host "✓ Windows artifacts signed"
