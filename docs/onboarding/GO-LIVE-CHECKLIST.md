# VANTORA — First Distributor Go-Live Checklist

**Env:** `vantora-staging` → production (`rsjvgehvastmawzwnqcs`). **`kako-fmcg` untouched.**
Work top-to-bottom. Do **not** start Phase 1 until Phase 0 is ✅. Each item: check the box + record who/when.

---

## Phase 0 — Backups & gate (no data mutation)
- [ ] **PITR enabled** (Dashboard → Database → Backups) — Pro plan + PITR add-on active.
- [ ] **Restore point verified** — restored a backup to a throwaway project; counts + schema integrity match.
- [ ] **Restore timestamp recorded** (UTC) as the rollback target: `____________`.
- [ ] Cleanup **dry-run** reviewed (`golive-demo-cleanup.sql` run as-is → "DRY RUN OK", rolled back).
- [ ] Production Readiness Report + this checklist **approved**. ➜ *only now may Phase 1 run.*

## Phase 1 — Demo cleanup (data-only, reversible via Phase 0)
- [ ] Run `supabase/pilot/golive-demo-cleanup.sql` with `vantora.cleanup_confirm='APPLY'`.
- [ ] Verify: `erp_companies`=0, `auth.users`=0, `erp_branches`/`customers`/`products`=0.
- [ ] Verify kept: `erp_roles`=25, `erp_role_permissions`=394, modules/features intact, guard trigger present.
- [ ] Schema integrity re-check passes (270 erp tables, FMCG RPCs).

## Phase 2 — Real master-data import (FK order)
- [ ] Company created (name, currency, country, `business_type='fmcg'`, van-sales + fmcg settings).
- [ ] `01-branches.csv` → branches (HQ flagged).
- [ ] `02-warehouses.csv` → main + van warehouses.
- [ ] `03-products.csv` → categories + SKUs (cost/sell/tax/pack/expiry).
- [ ] `04-suppliers.csv` → suppliers (terms).
- [ ] `05-routes.csv` → routes (rep + van + days).
- [ ] `06-customers.csv` → customers (credit limit, terms, GPS, route, salesman, cash/credit).
- [ ] Price lists + items + rules configured (in-app).
- [ ] `08-opening-stock.csv` → opening stock (main + vans).
- [ ] Row counts reconciled against each source file.

## Phase 3 — Users & roles
- [ ] **SMTP configured** (Auth → real sender domain); test email delivers.
- [ ] `07-users.csv` imported / users invited; each receives invite.
- [ ] Each user assigned correct **refined role** + branch + department + job title (+ van/route for field).
- [ ] Spot-check role nav: Merchandiser (Assortment/Survey/Grade, **no** Sell/Collections); Cash Van (cash
      only); Van Rep (cash+credit); Collection Officer (collect only); Credit Controller (approve, no posting).
- [ ] Refined-role assertions re-run against **live** users → all pass.

## Phase 4 — Public frontend
- [ ] Vercel **Production** env vars set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `KAKO_VAN_SALES=1`.
- [ ] Production branch promoted; temporary `staging-frontend` branch + committed `.env.production` removed.
- [ ] Deployment Protection / SSO disabled (or pilot password) so distributor staff can reach it.
- [ ] Custom domain attached (optional); Auth **Site URL** + redirect allow-list = public domain.
- [ ] **Smoke test on a real device**: login → role nav → sell (cash + credit) → collect → return + CN →
      day-close + reconciliation (variance 0).

## Phase 5 — Production hardening & sign-off
- [ ] **Leaked-password protection ON** (Auth → Passwords).
- [ ] Re-run Supabase advisors **after data load**; fix `duplicate_index`, `unindexed_foreign_keys`, remaining policies.
- [ ] Monitoring/alerts enabled (Supabase + Vercel); error logging on.
- [ ] Compute/pooler tier sized for pilot load.
- [ ] Pilot support playbook + feedback log live (`PILOT-SUPPORT-PLAYBOOK.md`, `templates/feedback-log.csv`).
- [ ] **Go/no-go** with the distributor on scope + data → **GO-LIVE**.

---

**Rollback at any point:** see `ROLLBACK-PROCEDURE.md`. Phase 1 is reversible via the Phase-0 restore point.
