# VANTORA — First Distributor Go-Live Checklist

**Env:** `vantora-staging` → production (`rsjvgehvastmawzwnqcs`). **`kako-fmcg` untouched.**
**Model: COEXISTENCE** — keep `Nile FMCG (DEMO)` as a permanent reference tenant and add the real
customer as a **second, RLS-isolated tenant** (no demo deletion). Work top-to-bottom; record who/when.

---

## Phase 0 — Backups (good practice; no destructive gate)
- [ ] **PITR / scheduled backup confirmed** (Dashboard → Database → Backups) — restore option available.
- [ ] (No demo wipe in this model — the demo tenant is retained. `golive-demo-cleanup.sql` is superseded.)
- [ ] Production Readiness Report + this checklist **approved**.

## Phase 1 — Provision the real-customer tenant (additive, alongside the demo)
- [ ] Edit + run `supabase/pilot/new-tenant-bootstrap.sql` (company name/ar/currency/country) → creates the
      empty FMCG company + settings + **refined-role company-scoped permissions** (required: these roles have
      no global defaults).
- [ ] Verify: a 2nd company row exists; `Nile FMCG (DEMO)` is untouched; new company carries refined-role perms.
- [ ] Confirm isolation: demo logins still see only the demo; the new tenant starts empty.

## Phase 2 — Real master-data import (FK order) — into the new tenant
- [ ] Company already created by Phase 1 (name, currency, country, `business_type='fmcg'`, van-sales + fmcg settings).
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
