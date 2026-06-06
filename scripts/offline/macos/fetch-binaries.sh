#!/usr/bin/env bash
# ============================================================================
# Fetch + stage the macOS sidecar binaries (offline edition).
# ----------------------------------------------------------------------------
# Downloads pinned, RELOCATABLE builds of PostgreSQL 17 (full bin/lib/share tree,
# theseus-rs portable binaries — verified to run from an arbitrary path via
# @loader_path), PostgREST, and Node, and stages them for Tauri's
# externalBin/resources. Also stages the offline lifecycle scripts + migrations
# into resources so the bundled node can run them. Idempotent.
#
#   scripts/offline/macos/fetch-binaries.sh [arm64|x86_64]
#
# Pins are overridable via env (KAKO_PG_VERSION / KAKO_PGRST_VERSION /
# KAKO_NODE_VERSION). Used by CI (.github/workflows/release.yml) and local builds.
# ============================================================================
set -euo pipefail

ARCH="${1:-arm64}"
case "$ARCH" in
  arm64|aarch64) TRIPLE="aarch64-apple-darwin"; NODE_ARCH="arm64"; PG_ARCH="aarch64"; PGRST_ARCH="aarch64" ;;
  x86_64|x64)    TRIPLE="x86_64-apple-darwin";  NODE_ARCH="x64";   PG_ARCH="x86_64";  PGRST_ARCH="x86-64" ;;
  *) echo "unknown arch $ARCH (use arm64|aarch64|x86_64)"; exit 2 ;;
esac

PG_VERSION="${KAKO_PG_VERSION:-17.10.0}"
PGRST_VERSION="${KAKO_PGRST_VERSION:-v14.13}"
NODE_VERSION="${KAKO_NODE_VERSION:-v22.11.0}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BIN="$ROOT/src-tauri/binaries"
RES="$ROOT/src-tauri/resources"
mkdir -p "$BIN" "$RES"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "› staging sidecars for $TRIPLE (pg=$PG_VERSION pgrst=$PGRST_VERSION node=$NODE_VERSION)"

# ── Node (the only externalBin sidecar; runs the offline lifecycle scripts) ──
echo "  · node"
curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz" -o "$TMP/node.tgz"
tar -xzf "$TMP/node.tgz" -C "$TMP"
cp "$TMP/node-${NODE_VERSION}-darwin-${NODE_ARCH}/bin/node" "$BIN/node-$TRIPLE"
chmod +x "$BIN/node-$TRIPLE"

# ── PostgreSQL 17 (full relocatable tree → resources/pgsql) ──────────────────
echo "  · postgresql (full tree → resources/pgsql)"
curl -fsSL "https://github.com/theseus-rs/postgresql-binaries/releases/download/${PG_VERSION}/postgresql-${PG_VERSION}-${PG_ARCH}-apple-darwin.tar.gz" -o "$TMP/pg.tgz"
rm -rf "$RES/pgsql"; mkdir -p "$RES/pgsql"
tar -xzf "$TMP/pg.tgz" -C "$RES/pgsql" --strip-components=1

# ── PostgREST → into the PG bin dir (KAKO_PG_BIN resolves it at runtime) ──────
echo "  · postgrest → resources/pgsql/bin"
curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/${PGRST_VERSION}/postgrest-${PGRST_VERSION}-macos-${PGRST_ARCH}.tar.xz" -o "$TMP/pgrst.tar.xz"
tar -xJf "$TMP/pgrst.tar.xz" -C "$TMP"
cp "$TMP/postgrest" "$RES/pgsql/bin/postgrest"
chmod +x "$RES/pgsql/bin/postgrest"

# Postgres + tools live in resources/pgsql WITH their dylib tree (relocatable via
# @loader_path); they are NOT externalBin (a single copied file breaks linkage).

# ── App scripts + the supabase tree into resources (run by the bundled node) ─
# Layout mirrors the repo so scripts/offline/lib.mjs resolves REPO_ROOT/supabase.
echo "  · offline scripts + supabase → resources"
rm -rf "$RES/scripts" "$RES/supabase"
mkdir -p "$RES/scripts/offline"
cp -R "$ROOT/scripts/offline/." "$RES/scripts/offline/"
cp -R "$ROOT/supabase" "$RES/supabase"

echo "✓ staged:"
ls -1 "$BIN" | sed 's/^/    binaries\//'
echo "    resources/pgsql/bin/{initdb,postgres,pg_ctl,psql,postgrest,...}"
echo "    resources/{scripts/offline,supabase/{migrations,ci}}"
