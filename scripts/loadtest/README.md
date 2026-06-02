# Load-test harness (staging only)

1. **Seed** a staging/branch DB: `psql "$STAGING_URL" -v company=<uuid> -v customers=25000 -v products=2000 -f seed.sql`
   (repeat per tenant to simulate ~10 companies).
2. **Run** the end-to-end list load test with k6 (authenticated cookie):
   `BASE=https://staging COOKIE="sb-access-token=..." k6 run k6-lists.js`
3. Pass criteria: **p95 < 500ms** on list/search endpoints; **error rate < 1%**; no full-table scans (check Supabase slow-query log).
4. Compare **count: exact vs planned** by toggling the entity's count mode for tables > 100k.

Never run against production. Clean up with `DELETE FROM erp_customers WHERE code LIKE 'LT-C%'` etc. on the test tenant.
