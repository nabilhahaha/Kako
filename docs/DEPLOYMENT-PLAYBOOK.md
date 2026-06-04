# Pilot Deployment & Recovery Playbook

*Review-first — **no production deployment performed**. The exact merge sequence, staging/production checklists, rollback, backup/restore drill, RTO/RPO, and staging load-test steps for the pilot release.*

---

## 0. Important reality: the stack is deeper than #78–#82
PRs #78–#82 are the **top of a ~14-deep stacked-PR lineage**, and the **0110 composite-index migration (#76) is on a divergent branch**. The real dependency chain (each PR's base = the branch below):

```
main
 └ #13 multi-branch foundation
   └ #14 company roles/permissions
     └ #61 S3 customer model (0103) → #62 S4a (0104) → #63 S4b (0105)
       → #64 Pricing-a (0106) → #65 Pricing-b
       → #66 UX-1 → #67 UX-4 → #68 UX-2 → #69 UX-3 → #70 UX-5
       → #71 Pilot Readiness → #72 Pilot Hardening (0107/0108) → #73 Walkthrough
       → #74 Customer Approval (0109)
         └ #78 Attachments (0111) → #79 FP-0 (0112) → #80 FP-CS (0113)
           → #81 DFG (0114–0117) → #82 UX hardening + S1/S2 (no migration)
     └ #76 Composite Indexes (0110)   ← DIVERGENT (also off #14)
```
**You cannot merge #78–#82 alone** — their ancestry (#13→#74) must land first, and **#76 (0110) must also land** or production will be missing the pilot indexes (the load test showed why they matter). Migration files apply in **numeric filename order** regardless of branch, so once all branches are on `main` the order is correct: `…0109 → 0110 → 0111 → … → 0117`.

## 1. Exact merge sequence (two strategies)

### Strategy A — Sequential bottom-up (faithful to per-PR review)
Merge to `main` in this order; GitHub auto-retargets each child's base as its parent merges; **re-run CI (incl. "Apply migrations to STAGING") after each**:
1. #13 → 2. #14 → 3. #61 → 4. #62 → 5. #63 → 6. #64 → 7. #65 → 8. #66 → 9. #67 → 10. #68 → 11. #69 → 12. #70 → 13. #71 → 14. #72 → 15. #73 → 16. **#76 (0110 indexes)** → 17. #74 → 18. #78 → 19. #79 → 20. #80 → 21. #81 → 22. #82.
*(Place #76 before #74 so the index file is present early; numeric order makes it apply between 0109 and 0111 either way.)* Docs-only #75/#77 can merge anytime or be closed.

### Strategy B — Integration release branch (recommended for the pilot)
The `claude/ux-hardening-pilot` tip **already contains the cumulative chain** (migrations 0100–0117) **except 0110**. So:
1. Cut `release/pilot` from `main`.
2. Merge/fast-forward the `claude/ux-hardening-pilot` content into it.
3. **Cherry-pick `0110_composite_indexes.sql` from `#76`** into `release/pilot` (the only missing migration).
4. Open one PR `release/pilot → main`; run the **full CI** (typecheck/build, integration, **staging migration apply of the whole 0100–0117 chain**, Playwright).
5. Merge once green; close the superseded stacked PRs with a note (per-PR review already done).

**Recommendation:** **Strategy B** for a clean, single, fully-CI'd pilot release; keep Strategy A documented if granular merge history is required. **Either way, verify 0110 is present and the chain applies with no gaps before production.**

## 2. Staging deployment checklist
- [ ] All target branches merged into the release target; **`supabase/migrations/` has a contiguous 0100–0117 (incl. 0110)** — no missing numbers.
- [ ] CI green on the release PR: **typecheck/build · integration (DB) · Apply migrations to STAGING · Playwright**.
- [ ] Staging DB: confirm migration history matches files (`supabase_migrations`); no failed/partial applies.
- [ ] Smoke test on staging: login, customers/products/suppliers/inventory lists (pagination + search), create invoice/order, record payment, approvals inbox, field-governance settings, attachments upload.
- [ ] Seed a load-test tenant and **run the staging load test (§7)**; confirm p95 < 500ms, error < 1%.
- [ ] Verify RLS isolation with a second test company (no cross-tenant reads).
- [ ] Confirm env/secrets on staging (Supabase keys, `SUPABASE_SERVICE_ROLE_KEY`, Sentry DSN).
- [ ] Sign-off: product + eng.

## 3. Production deployment checklist
- [ ] Staging checklist fully passed; pilot company + users provisioned plan ready.
- [ ] **Backup taken immediately before** (manual snapshot) + confirm PITR enabled (§5).
- [ ] Maintenance window scheduled (low-traffic); stakeholders notified.
- [ ] Apply migrations to **production** via the guarded job (`migrate-staging.yml`'s production path / manual approval) — **in numeric order, one run**; watch for errors.
- [ ] Verify migration history + a quick read on key tables; run the production smoke test (as §2, non-destructive).
- [ ] Confirm Sentry receiving events; dashboards/alerts live (§ monitoring).
- [ ] Feature/availability check with the pilot admin; then open access.
- [ ] Tag the release; record the deployed migration high-water mark (0117) + commit SHA.
- [ ] **Do not** run destructive/seed scripts on production.

## 4. Rollback procedure
Migrations are **forward-only / immutable** (the `-- rollback` SQL in each file is for emergencies, not routine down-migration). Order of preference:
1. **App rollback (fast, safe for code-only issues):** redeploy the previous app build (Vercel previous deployment). Most DFG/UX changes are additive and **safe-default** (no published config = today's behavior), so the prior app works against the new schema.
2. **Schema issue:** if a migration caused a problem, prefer **PITR restore** (§5) to a point just before the apply — cleaner than hand-running down-SQL on a live tenant. For a single additive object, the commented rollback SQL (drop table/trigger/column) may be applied **only** after confirming no dependent data.
3. **Data corruption / tenant issue:** **PITR restore** to the last good timestamp (RPO minutes); communicate the recovery window.
4. Always: capture the failure, the migration/commit, and a post-mortem; never edit an already-applied migration file — add a new corrective migration.

## 5. Backup / restore drill procedure
- [ ] Confirm **Supabase automated daily backups** on staging + production.
- [ ] Confirm **PITR enabled** on production (Pro+); record retention window (e.g., 7 days).
- [ ] **Drill (on staging or a clone):** create a Supabase **branch/restore** from the latest backup → verify row counts on `erp_customers/invoices/payments`, the `supabase_migrations` history, and that the app boots + lists render against it.
- [ ] **PITR drill:** restore to a timestamp 10 min in the past on a clone; confirm expected state.
- [ ] Document the runbook (who runs it, steps, verification queries) and store credentials access in the ops vault.
- [ ] Re-run the drill quarterly.

## 6. RTO / RPO targets (pilot)
| Metric | Target | Mechanism |
|---|---|---|
| **RPO** (max data loss) | **≤ 5 minutes** | PITR (production); ≤ 24h fallback via daily backup |
| **RTO** (time to restore) | **≤ 2 hours** | restore latest backup/PITR to a clone + cutover; drill-validated |
| App rollback | **≤ 15 minutes** | redeploy previous Vercel build |
| Migration-failure recovery | **≤ 1 hour** | PITR to pre-apply timestamp |
> Tighten RTO/RPO for commercial scale; pilot targets assume Supabase Pro PITR.

## 7. Required staging load-test execution steps
1. **Apply 0110 indexes** are present on staging (part of the release).
2. **Seed** (per tenant, ~10 tenants): `psql "$STAGING_URL" -v company=<uuid> -v customers=25000 -v products=2000 -f scripts/loadtest/seed.sql`.
3. `ANALYZE` runs in the seed; confirm planner stats are fresh.
4. **Run k6:** `BASE=https://<staging> COOKIE="sb-access-token=…" k6 run scripts/loadtest/k6-lists.js` (ramps to 50 VUs; thresholds p95<500ms, error<1%).
5. Review the **Supabase slow-query log**; confirm list/search use index scans, not seq scans; verify `count: exact` cost on the largest tenant (flip to `planned` if >100k as designed).
6. Record results; if p95 regresses, apply the documented mitigations (planned count, pg_trgm search, keyset for deep pages) before onboarding a large tenant.
7. Clean up seeded rows (`DELETE … WHERE code LIKE 'LT-%'`) on the test tenant.

## Summary
- **Merge:** the full lineage must land (recommend **Strategy B** integration branch + cherry-pick 0110); migrations apply numerically 0100→0117.
- **Deploy:** staging checklist → load test → backup → guarded production apply → smoke → open access.
- **Recover:** app rollback (15 min) for code; **PITR** (RPO ≤ 5 min, RTO ≤ 2 h) for schema/data; never edit applied migrations.

---

*Playbook only. No production deployment, no merge, no production migrations performed.*
