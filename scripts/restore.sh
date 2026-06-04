#!/usr/bin/env bash
# restore.sh — restore a dump produced by backup.sh into DATABASE_URL.
#
# !! DESTRUCTIVE !! This OVERWRITES the contents of the target database.
# It normally targets STAGING, never production. Restoring to production is a
# disaster-recovery action that should be done deliberately and rarely.
#
# Usage:
#   DATABASE_URL='postgresql://user:pass@host:5432/dbname?sslmode=require' \
#     scripts/restore.sh --yes <dump-file>
#
# The dump file may be:
#   *.sql.gz  / *.sql   — plain SQL (restored with psql)
#   *.dump.gz / *.dump  — pg_dump custom format (restored with pg_restore)
#   *.gpg               — GPG-encrypted; decrypt first (gpg -d > file) then pass that.
#
# The --yes flag is REQUIRED. Without it the script refuses to run.
# DATABASE_URL is supplied by the caller; NEVER hardcode credentials here.
set -euo pipefail

CONFIRM="no"
DUMP_FILE=""

for arg in "$@"; do
  case "$arg" in
    --yes)  CONFIRM="yes" ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    -*)
      echo "restore.sh: unknown flag: $arg" >&2
      exit 2
      ;;
    *)
      if [ -n "$DUMP_FILE" ]; then
        echo "restore.sh: more than one dump file given" >&2
        exit 2
      fi
      DUMP_FILE="$arg"
      ;;
  esac
done

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Export the target connection string first." >&2
  echo "       (This should normally be your STAGING database, not production.)" >&2
  exit 1
fi

if [ -z "$DUMP_FILE" ]; then
  echo "ERROR: no dump file given." >&2
  echo "Usage: DATABASE_URL=... scripts/restore.sh --yes <dump-file>" >&2
  exit 2
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "ERROR: dump file not found: $DUMP_FILE" >&2
  exit 1
fi

if [ "$CONFIRM" != "yes" ]; then
  cat >&2 <<'EOF'
REFUSING TO RUN: restore is destructive and requires explicit confirmation.

This command will OVERWRITE data in the database referenced by DATABASE_URL.
Re-run with the --yes flag once you are certain of the target:

  DATABASE_URL=... scripts/restore.sh --yes <dump-file>

Target STAGING, not production, unless this is a deliberate disaster-recovery.
EOF
  exit 1
fi

cat >&2 <<'EOF'
============================================================
  !!  WARNING: DESTRUCTIVE RESTORE  !!
  This OVERWRITES the data in the target DATABASE_URL.
  This should normally target STAGING, never production.
============================================================
EOF

# Show a redacted target (host + db only, no credentials) for sanity.
host_db="${DATABASE_URL#*@}"
echo "› restoring '$DUMP_FILE' into: ${host_db}" >&2

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install the postgresql-client package." >&2
  exit 1
fi

case "$DUMP_FILE" in
  *.dump.gz)
    command -v pg_restore >/dev/null 2>&1 || { echo "ERROR: pg_restore not found." >&2; exit 1; }
    gunzip -c "$DUMP_FILE" | pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL"
    ;;
  *.dump)
    command -v pg_restore >/dev/null 2>&1 || { echo "ERROR: pg_restore not found." >&2; exit 1; }
    pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" "$DUMP_FILE"
    ;;
  *.sql.gz)
    gunzip -c "$DUMP_FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
    ;;
  *.sql)
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"
    ;;
  *.gpg)
    echo "ERROR: '$DUMP_FILE' is GPG-encrypted. Decrypt it first, e.g.:" >&2
    echo "       gpg --decrypt '$DUMP_FILE' > restored.sql.gz" >&2
    echo "       then re-run restore.sh against the decrypted file." >&2
    exit 1
    ;;
  *)
    echo "ERROR: unrecognized dump extension for '$DUMP_FILE'." >&2
    echo "       Expected one of: .sql, .sql.gz, .dump, .dump.gz" >&2
    exit 2
    ;;
esac

echo "› restore complete." >&2
