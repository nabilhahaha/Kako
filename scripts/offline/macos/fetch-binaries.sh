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
  arm64)  TRIPLE="aarch64-apple-darwin"; NODE_ARCH="arm64"; PG_ARCH="aarch64"; PGRST_ARCH="aarch64" ;;
  x86_64) TRIPLE="x86_64-apple-darwin";  NODE_ARCH="x64";   PG_ARCH="x86_64";  PGRST_ARCH="x86-64" ;;
  *) echo "unknown arch $ARCH (use arm64|x86_64)"; exit 2 ;;
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

# ── Node ────────────────────────────────────────────────────────────────────
echo "  · node"
curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz" -o "$TMP/node.tgz"
tar -xzf "$TMP/node.tgz" -C "$TMP"
cp "$TMP/node-${NODE_VERSION}-darwin-${NODE_ARCH}/bin/node" "$BIN/node-$TRIPLE"

# ── PostgREST ─────────────────────────────────────────────────────────────────
echo "  · postgrest"
curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/${PGRST_VERSION}/postgrest-${PGRST_VERSION}-macos-${PGRST_ARCH}.tar.xz" -o "$TMP/pgrst.tar.xz"
tar -xJf "$TMP/pgrst.tar.xz" -C "$TMP"
cp "$TMP/postgrest" "$BIN/postgrest-$TRIPLE"

# ── PostgreSQL 17 (full relocatable tree) ────────────────────────────────────
echo "  · postgresql (full tree → resources/pgsql)"
curl -fsSL "https://github.com/theseus-rs/postgresql-binaries/releases/download/${PG_VERSION}/postgresql-${PG_VERSION}-${PG_ARCH}-apple-darwin.tar.gz" -o "$TMP/pg.tgz"
rm -rf "$RES/pgsql"; mkdir -p "$RES/pgsql"
tar -xzf "$TMP/pg.tgz" -C "$RES/pgsql" --strip-components=1
# externalBin launcher = the postgres binary from the bundled tree (KAKO_PG_BIN
# points at resources/pgsql/bin for the rest of the tools at runtime).
cp "$RES/pgsql/bin/postgres" "$BIN/postgres-$TRIPLE"

chmod +x "$BIN/node-$TRIPLE" "$BIN/postgrest-$TRIPLE" "$BIN/postgres-$TRIPLE"

# ── App scripts + migrations into resources (run by the bundled node) ────────
echo "  · offline scripts + migrations → resources"
mkdir -p "$RES/scripts/offline" "$RES/migrations"
cp -R "$ROOT/scripts/offline/." "$RES/scripts/offline/"
cp -R "$ROOT/supabase/migrations/." "$RES/migrations/"

echo "✓ staged:"
ls -1 "$BIN" | sed 's/^/    binaries\//'
echo "    resources/pgsql/bin/{initdb,postgres,pg_ctl,psql,...}"
