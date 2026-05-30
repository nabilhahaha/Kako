#!/usr/bin/env bash
# Builds the integration-test database: a Supabase-compatible bootstrap followed
# by the erp_ migration chain. Used by CI and runnable locally against any throw-
# away Postgres (set TEST_DATABASE_URL first).
#
# The erp_ schema that the integration tests exercise is self-contained from
# migration 0005 onward; 0001–0004 patch the legacy inventory app whose base
# tables were never captured as migrations, so they are skipped here.
set -euo pipefail

DB_URL="${TEST_DATABASE_URL:?set TEST_DATABASE_URL (e.g. postgresql://postgres:postgres@127.0.0.1:5432/postgres)}"
SUPA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q)

echo "› bootstrap"
"${PSQL[@]}" -f "$SUPA_DIR/ci/bootstrap.sql"

for f in "$SUPA_DIR"/migrations/*.sql; do
  case "$(basename "$f")" in
    0001_*|0002_*|0003_*|0004_*) continue ;;  # legacy inventory app — not needed by erp tests
  esac
  "${PSQL[@]}" -f "$f"
done

echo "› schema ready"
