#!/usr/bin/env bash
# Builds the integration-test database from scratch: a Supabase-compatible
# bootstrap, the legacy app base stubs, then the FULL migration chain. Used by
# CI and runnable locally against any throwaway Postgres (set TEST_DATABASE_URL).
#
# Migrations 0001–0004 patch the legacy "FieldSync" inventory app whose base
# tables predate the migrations folder; legacy-base.sql stubs just enough of
# them (and bootstrap.sql provides storage/realtime) so every migration applies.
set -euo pipefail

DB_URL="${TEST_DATABASE_URL:?set TEST_DATABASE_URL (e.g. postgresql://postgres:postgres@127.0.0.1:5432/postgres)}"
SUPA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q)

echo "› bootstrap (Supabase env)"
"${PSQL[@]}" -f "$SUPA_DIR/ci/bootstrap.sql"

echo "› legacy app base"
"${PSQL[@]}" -f "$SUPA_DIR/ci/legacy-base.sql"

echo "› migrations"
for f in "$SUPA_DIR"/migrations/*.sql; do
  "${PSQL[@]}" -f "$f"
done

echo "› schema ready"
