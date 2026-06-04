#!/usr/bin/env bash
# backup.sh — dump a Postgres/Supabase database to a gzipped file.
#
# Reads DATABASE_URL from the environment, runs pg_dump, and writes a
# timestamped, gzipped dump to backups/<db>-<UTC-timestamp>.sql.gz.
#
# Usage:
#   DATABASE_URL='postgresql://user:pass@host:5432/dbname?sslmode=require' \
#     scripts/backup.sh [--format=plain|custom] [--out-dir=DIR]
#
# Formats:
#   plain  (default) — gzipped plain SQL, restorable with restore.sh / psql.
#   custom           — pg_dump custom format (.dump.gz), restore with pg_restore.
#
# NEVER hardcode credentials here; DATABASE_URL is supplied by the caller
# (locally via env, in CI via a GitHub Actions secret).
set -euo pipefail

FORMAT="plain"
OUT_DIR="backups"

for arg in "$@"; do
  case "$arg" in
    --format=*)  FORMAT="${arg#*=}" ;;
    --out-dir=*) OUT_DIR="${arg#*=}" ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "backup.sh: unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if [ -z "${DATABASE_URL:-}" ]; then
  cat >&2 <<'EOF'
ERROR: DATABASE_URL is not set.

Set it to the Postgres connection string of the database to back up, e.g.
  export DATABASE_URL='postgresql://user:pass@host:5432/dbname?sslmode=require'
Then re-run: scripts/backup.sh

(In CI this comes from a GitHub Actions secret — never hardcode it.)
EOF
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install the postgresql-client package." >&2
  exit 1
fi

# Derive a filesystem-safe database name from the connection string's path
# component (strip query string, leading slash); fall back to "database".
db_path="${DATABASE_URL#*://}"
db_name="${db_path##*/}"
db_name="${db_name%%\?*}"
db_name="${db_name:-database}"
db_name="$(printf '%s' "$db_name" | tr -c 'A-Za-z0-9._-' '_')"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"

case "$FORMAT" in
  plain)
    out_file="$OUT_DIR/${db_name}-${timestamp}.sql.gz"
    echo "› dumping (plain SQL) to $out_file"
    pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" | gzip -9 > "$out_file"
    ;;
  custom)
    out_file="$OUT_DIR/${db_name}-${timestamp}.dump.gz"
    echo "› dumping (custom format) to $out_file"
    pg_dump --no-owner --no-privileges --format=custom "$DATABASE_URL" | gzip -9 > "$out_file"
    ;;
  *)
    echo "backup.sh: invalid --format '$FORMAT' (expected: plain|custom)" >&2
    exit 2
    ;;
esac

size="$(du -h "$out_file" | cut -f1)"
echo "› done: $out_file ($size)"
printf '%s\n' "$out_file"
