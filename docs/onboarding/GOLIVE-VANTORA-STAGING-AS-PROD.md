# VANTORA — First Distributor Go-Live Plan (promote `vantora-staging` to production)

**Decision:** `vantora-staging` (Supabase `rsjvgehvastmawzwnqcs`, eu-west-1) becomes the **production**
environment for the first FMCG distributor pilot. **`kako-fmcg` is not rebuilt and not touched.**
**Date:** 2026-06-10.

Foundation already in place (validated): full repo schema (270 erp tables, all FMCG RPCs, tenant-scoped
numbering `0268`), the refined FMCG role model (seeded by default), and the sell→collect→return→reconcile
loop. This plan turns that proven environment into a live pilot for one real distributor.

> Execution order: **1 → 5**. Each step has an owner, a concrete action, and a "done when" check.
> Steps that mutate data are reversible via PITR (enabled in step 5.1 **before** any destructive step).

---

## 0. Pre-flight (do first)

| # | Action | Done when |
|---|---|---|
| 0.1 | **Enable PITR / on-demand backup** on `rsjvgehvastmawzwnqcs` (Dashboard → Database → Backups) and confirm restorable. | A restore point exists **before** the demo wipe in step 1. |
| 0.2 | Freeze the project as prod: rename to `vantora-prod` (optional), tag the org/project, restrict dashboard access to admins. | Only the pilot admins can reach the project. |
| 0.3 | Snapshot the current demo state (counts) for the record. | `erp_companies`/`auth.users` counts captured. |

## 1. Demo data cleanup

Goal: remove all demo/test tenants and identities so production starts with **zero business data** but the
**schema, seed roles, and global lookups intact**.

**Scope to delete**
- The demo company **Nile FMCG Distribution Group** and everything scoped to it (branches, warehouses,
  users' branch memberships, products, customers, suppliers, price lists/rules, routes, stock, invoices,
  collections, returns, POs, transfers).
- All demo identities: `auth.users` where `email LIKE '%@nile-group.test'`.
- Any other `*.test` tenants created during validation.

**Method (run after PITR is confirmed):**
1. Delete demo auth identities — `DELETE FROM auth.users WHERE email LIKE '%@nile-group.test';`
   (cascades to `erp_profiles`/`erp_user_branches` via FK).
2. Delete the demo company by id — rely on `ON DELETE CASCADE` where present; for any tables without
   cascade, delete child rows first (branches → warehouses → stock/routes/customers → documents).
   A single transaction; verify row counts are zero for that `company_id` before commit.
3. **Keep** global rows: `erp_roles` (21 system + 4 refined), global `erp_role_permissions`, `erp_modules`/
   `erp_features`, and the cash-van guard trigger — these are not tenant data.

**Done when:** `erp_companies` = 0 business tenants, `auth.users` has no `*.test` rows, schema-integrity
check still passes, refined roles still present in `erp_roles`.

> **Do NOT** drop `public` or re-run migrations — the schema is already correct. Cleanup is data-only.

## 2. Real master-data import process

Import the distributor's actual data. Templates already exist in
`docs/onboarding/templates/*.csv`; load order matters (FKs).

| Order | Entity | Source template | Notes |
|---|---|---|---|
| 1 | Company (1 row) | create in-app or SQL | currency, country, `business_type='fmcg'`, van-sales + fmcg settings |
| 2 | Branches + warehouses (main + vans) | `branches.csv` / setup guide | codes unique per company; mark HQ; create van warehouses per rep |
| 3 | Departments + job titles | optional | organizational only |
| 4 | Product categories → Products (SKUs) | `products.csv` | cost/sell/tax%, pack size, barcode, expiry |
| 5 | Suppliers | `suppliers.csv` | payment terms |
| 6 | Price lists + items + rules | `pricing.csv` | default list mirrors sell price; rules for promos |
| 7 | Routes (rep + van + days) | `routes.csv` | assign rep + van warehouse |
| 8 | Customers | `customers.csv` | credit limit, terms, GPS, route, salesman; approval workflow |
| 9 | Opening stock | `opening-stock.csv` | main + van quantities |

**Mechanism:** prefer the **in-app import screens** (Data Admin / `it_admin`) so RLS + validation run; fall
back to SQL (service role) for bulk first-load. Validate each entity count against the source file after load.

**Done when:** all source rows imported, counts match, a spot sell→collect dry-run against one real
customer balances (invoice number `INV-<BRANCH>-000001`, reconciliation variance 0).

## 3. User invitation process

Replace demo `*.test` logins with **real invited users** — no shared passwords.

1. **Configure SMTP** (Dashboard → Auth → SMTP) so invite/confirmation emails send from a real domain
   (e.g. `noreply@<distributor-domain>`). Until then, invites won't deliver.
2. **Invite** each employee via the app (Settings → Users → Invite) or Supabase Auth → Invite. GoTrue sends
   a magic-link/confirmation; the `erp_on_auth_user_created` trigger creates their `erp_profiles` row.
3. **Assign** each user a branch membership (`erp_user_branches`) with the correct **refined role**:
   `merchandiser` / `cash_van` / `salesman` (van rep, cash+credit) / `collection_officer` /
   `credit_controller` / `supervisor` / `manager` / `admin` / `accountant` / `warehouse_keeper` / `viewer`,
   plus department + job title + assigned van/route for field roles.
4. **Verify** each login authenticates and lands on the correct role-based navigation (Merchandiser sees
   Assortment/Survey/Grade and **no** Sell/Collections; Cash Van sells cash only; etc.).

**Done when:** every real user can log in via the public URL, has exactly one default branch + correct role,
and the refined-role assertions pass for the live users.

## 4. Public frontend deployment plan

Today a Vercel **preview** is wired to this project but sits behind Vercel SSO and reads the URL from a
throwaway-branch `.env.production`. For pilot, make it a real public production deployment.

1. **Set Vercel project env vars** (Production scope, Settings → Environment Variables) — do **not** rely on
   the code fallback:
   - `NEXT_PUBLIC_SUPABASE_URL = https://rsjvgehvastmawzwnqcs.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY = <project anon/publishable key>`
   - `KAKO_VAN_SALES = 1`
2. **Promote a production branch** (e.g. `main`) as the Production deployment; remove the temporary
   `staging-frontend` branch + committed `.env.production` so the URL isn't pinned by a throwaway artifact.
3. **Disable Deployment Protection / SSO** for the production deployment (or restrict to the pilot via a
   password) so distributor staff can reach it.
4. **Custom domain** (optional, recommended): attach `pilot.<distributor>.com` (or a VANTORA subdomain) in
   Vercel → Domains; set Supabase Auth **Site URL** + redirect allow-list to that domain so invite/confirm
   links resolve.
5. **Smoke-test** the public URL: login, role nav, a real sell→collect, a return+credit-note, a day-close +
   reconciliation.

**Done when:** a public HTTPS URL serves the app, authenticates real users against this project, and the full
loop works from a field device.

## 5. Production readiness checklist

| Area | Item | Status / Action |
|---|---|---|
| **Backups** | PITR enabled + restore verified | ⬜ do in step 0.1 (gate for step 1) |
| **Auth** | SMTP configured (real sender) | ⬜ step 3.1 |
| **Auth** | Site URL + redirect allow-list = public domain | ⬜ step 4.4 |
| **Auth** | **Leaked-password protection ON** | ⬜ Dashboard → Auth → Passwords (advisor: `auth_leaked_password_protection`) |
| **Auth** | MFA options enabled for admins (optional) | ⬜ recommended |
| **Schema** | Integrity check (270 erp tables, FMCG RPCs, `0268`) | ✅ verified |
| **Schema** | Migration tracker backfilled (`supabase_migrations`) | ⬜ optional, for future `db push` |
| **Roles** | Refined FMCG roles + company grants present | ✅ seeded by default |
| **Roles** | Refined-role assertions pass for **live** users | ⬜ re-run after step 3 |
| **Security** | Advisors: **0 ERROR** (184 WARN) | ✅ no blockers — warnings are the by-design `SECURITY DEFINER` RPC pattern (157), `function_search_path_mutable` ×13 (add `SET search_path` — hardening), `rls_policy_always_true` ×11 (review lookup tables), `extension_in_public` ×2 (cosmetic) |
| **Performance** | Advisors mostly empty-DB artifacts | ◻ defer: `unused_index` ×344 + `multiple_permissive_policies` ×430 are noise on an empty DB — **re-run advisors after real-data load**, then act on what remains; fix `duplicate_index` ×1 + `unindexed_foreign_keys` ×4 |
| **Tenancy** | RLS enforced; tenant-scoped numbering | ✅ (0268) — confirm with a 2-tenant spot check if more than one company goes live |
| **Data** | Real master data imported + counts reconciled | ⬜ step 2 |
| **Ops** | Monitoring/alerts (Supabase + Vercel), error logging | ⬜ enable dashboards + log drains |
| **Ops** | Compute tier sized for pilot load (connections/pooler) | ⬜ review `auth_db_connections` advisor; bump from free/$10 if needed |
| **Support** | Pilot support playbook + feedback log live | ✅ `docs/onboarding/PILOT-SUPPORT-PLAYBOOK.md`, `templates/feedback-log.csv` |
| **Sign-off** | Go/no-go with the distributor on scope + data | ⬜ final gate |

---

## Owner & sequencing summary

1. **Pre-flight + cleanup** (Platform admin) — PITR, then wipe demo. *Reversible via PITR.*
2. **Master-data import** (Data Admin + distributor) — load real catalog/customers/routes; dry-run.
3. **User invites** (Platform admin) — SMTP, invite, assign refined roles, verify logins.
4. **Public frontend** (Platform admin) — Vercel prod env vars, domain, disable SSO, smoke-test.
5. **Readiness sign-off** (all) — checklist green → go-live with one distributor.

**Guardrails:** `kako-fmcg` untouched; no schema drop / no migration re-run (schema already correct);
cleanup is data-only and PITR-protected; refined roles re-asserted against live users before sign-off.
