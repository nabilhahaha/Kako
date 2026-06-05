#!/usr/bin/env bash
# ============================================================================
# Fetch + stage the macOS sidecar binaries (P1, Apple Silicon first).
# ----------------------------------------------------------------------------
# Stages PostgreSQL 17 (full bin/lib/share tree) + PostgREST + Node into
# src-tauri/ for Tauri's externalBin/resources. Run on the Mac before tauri build.
#
#   scripts/offline/macos/fetch-binaries.sh [arm64|x86_64]
# Defaults to arm64 (the dev machine). x86_64 only if an Intel build is attempted.
# ============================================================================
set -euo pipefail
ARCH="${1:-arm64}"
case "$ARCH" in
  arm64)  TRIPLE="aarch64-apple-darwin" ;;
  x86_64) TRIPLE="x86_64-apple-darwin" ;;
  *) echo "unknown arch $ARCH"; exit 2 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BIN="$ROOT/src-tauri/binaries"
RES="$ROOT/src-tauri/resources"
mkdir -p "$BIN" "$RES/pgsql" "$RES/scripts/offline" "$RES/migrations"

echo "› staging app scripts + migrations into resources"
cp -R "$ROOT/scripts/offline/." "$RES/scripts/offline/"
cp -R "$ROOT/supabase/migrations/." "$RES/migrations/"
cp -R "$ROOT/supabase/ci" "$RES/" 2>/dev/null || true

cat <<EOF
NEXT STEPS (manual, documented for the Mac build):
  1. PostgreSQL 17 (arm64): use the EnterpriseDB or Homebrew bottle; copy the
     full bin/ (initdb, pg_ctl, postgres, pg_dump, pg_restore, psql) + lib/ +
     share/ into:  $RES/pgsql/
     Then symlink/copy the launcher:  cp "$RES/pgsql/bin/postgres" "$BIN/postgres-$TRIPLE"
  2. PostgREST (arm64): download the macOS aarch64 release →
       cp postgrest "$BIN/postgrest-$TRIPLE"
  3. Node (arm64): copy your node binary →
       cp "\$(command -v node)" "$BIN/node-$TRIPLE"
  4. Sign every staged binary in scripts/release/mac.sh.

KAKO_PG_BIN should point at $RES/pgsql/bin at runtime (set by the shell).
EOF
