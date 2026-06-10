#!/usr/bin/env bash
# ============================================================================
# VANTORA — one-shot schema provisioning for a FRESH Supabase project.
# ----------------------------------------------------------------------------
# Brings an EMPTY Supabase project up to the exact repository schema (the same
# migration chain CI applies), so it matches PR #311 before any seed/demo data.
#
# Unlike supabase/ci/setup-test-db.sh (which targets a PLAIN Postgres and runs
# ci/bootstrap.sql to STUB the Supabase environment), a real Supabase project
# ALREADY provides auth/roles/extensions/storage/realtime. So this script does
# NOT run bootstrap.sql (it must not override Supabase's native auth.uid()). It
# applies, in order:
#     1) ci/legacy-base.sql   — stubs the legacy "FieldSync" base tables that
#                               migrations 0001–0004 patch (a clone would already
#                               have them; a fresh project does not).
#     2) migrations/*.sql      — the FULL chain, filename order (same as CI).
#     3) a schema-integrity verification (asserts key PR #311 objects exist).
#
# Run this ONCE against a FRESH project (migrations are not idempotent).
#
# USAGE:
#   DATABASE_URL='postgresql://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres' \
#     bash supabase/ci/setup-staging-project.sh
#
#   (Get the connection string from the Supabase dashboard:
#    Project Settings → Database → Connection string → URI. Use the DB password
#    you set/reset there. The direct 5432 URI is simplest for a one-shot.)
# ============================================================================
set -euo pipefail

DB_URL="${DATABASE_URL:?set DATABASE_URL to the target Supabase project connection string}"
SUPA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Parse the connection URL OURSELVES (no percent-decoding) so passwords with URI
# metacharacters like % work. libpq's URI parser would choke on a raw % in the
# password; we extract fields literally and connect via PG* env + a key=value
# conninfo (PGPASSWORD is taken verbatim).
_u="${DB_URL#*://}"                       # strip scheme (postgres:// or postgresql://)
_userinfo="${_u%%@*}"                      # user:password  (assumes no '@' in password)
_hostpart="${_u#*@}"                       # host:port/db?params
export PGUSER="${_userinfo%%:*}"
export PGPASSWORD="${_userinfo#*:}"        # literal — % and other chars preserved
_hostport="${_hostpart%%/*}"
export PGHOST="${_hostport%%:*}"
PGPORT="${_hostport#*:}"; [ "$PGPORT" = "$_hostport" ] && PGPORT=5432; export PGPORT
_db="${_hostpart#*/}"; _db="${_db%%\?*}"; [ -z "$_db" ] && _db=postgres; export PGDATABASE="$_db"
export PGSSLMODE="${PGSSLMODE:-require}"   # Supabase requires TLS
# Ensure pgcrypto/uuid functions resolve unqualified during apply (Supabase keeps
# them in the `extensions` schema). Harmless if already on the search_path.
export PGOPTIONS="-c search_path=public,extensions"
PSQL=(psql -v ON_ERROR_STOP=1 -q)         # connection comes from PG* env vars

echo "› verifying connectivity to the target database (host=$PGHOST port=$PGPORT user=$PGUSER db=$PGDATABASE)…"
"${PSQL[@]}" -c "select 'connected to '||current_database()||' on '||version();" >/dev/null

echo "› ensure extensions present (no-op on Supabase)"
"${PSQL[@]}" -c "create extension if not exists pgcrypto with schema extensions; create extension if not exists \"uuid-ossp\" with schema extensions;" || true

echo "› legacy app base (stubs the pre-migrations FieldSync tables)"
"${PSQL[@]}" -f "$SUPA_DIR/ci/legacy-base.sql"

echo "› migrations (full chain, filename order)"
count=0
for f in "$SUPA_DIR"/migrations/*.sql; do
  echo "  → $(basename "$f")"
  "${PSQL[@]}" -f "$f"
  count=$((count+1))
done
echo "› applied $count migrations"

echo "› verifying schema integrity (PR #311 objects)…"
"${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  missing text := '';
  t text; f text;
BEGIN
  -- Key tables that must exist after the full chain.
  FOREACH t IN ARRAY ARRAY[
    'erp_companies','erp_branches','erp_warehouses','erp_user_branches','erp_profiles',
    'erp_roles','erp_role_permissions','erp_departments','erp_job_titles',
    'erp_products_catalog','erp_product_categories','erp_customers','erp_suppliers',
    'erp_price_lists','erp_price_list_items','erp_price_rules','erp_routes',
    'erp_return_reasons','erp_van_sales_settings','erp_fmcg_settings',
    'erp_inventory_stock','erp_purchase_orders','erp_transfer_orders',
    'erp_invoices','erp_collections','erp_sales_returns','erp_credit_notes',
    'erp_van_reconciliations','erp_work_sessions'
  ] LOOP
    IF to_regclass('public.'||t) IS NULL THEN missing := missing||' table:'||t; END IF;
  END LOOP;
  -- Key functions (the FMCG loop + permission authority + numbering).
  FOREACH f IN ARRAY ARRAY[
    'erp_van_sell','erp_van_return','erp_settle_collection','erp_compute_van_reconciliation',
    'erp_issue_invoice','erp_receive_purchase_order','erp_complete_transfer',
    'erp_next_number','erp_user_has_permission','erp_resolve_price','erp_close_day','erp_check_in_visit'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname=f) THEN missing := missing||' func:'||f; END IF;
  END LOOP;
  -- The 0268 tenant-scoped numbering indexes (a representative one).
  IF to_regclass('public.erp_invoices_invoice_number_scope_key') IS NULL
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='erp_invoices_invoice_number_scope_key')
  THEN missing := missing||' index:erp_invoices_invoice_number_scope_key'; END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'SCHEMA INTEGRITY FAILED — missing:%', missing;
  END IF;
  RAISE NOTICE '════ SCHEMA INTEGRITY OK — staging matches the repository (PR #311) ════';
END $$;
SQL

echo "› DONE. Staging schema is fully migrated and verified. Safe to seed."
