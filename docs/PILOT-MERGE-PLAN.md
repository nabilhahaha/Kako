# Pilot Merge Plan + Final Go/No-Go

Sequencing for landing the pilot stack and migrating the pilot tenant. **No
production migration is applied until you approve** (the CI "Apply to PRODUCTION"
job is manual/guarded; everything below is staging-verified only).

---

## 1. The stack (bottom-up, each stacked on the previous)
All branch off `claude/company-roles-permissions` (which already has S1 #59 + S2 #60).

| Order | PR | Slice | Migration | CI |
|---|---|---|---|---|
| 1 | #61 | S3 — customer model + company master data | 0103 | ✅ |
| 2 | #62 | S4a — hierarchy scope + RLS (customers/routes) | 0104 | ✅ |
| 3 | #63 | S4b — transactional scope + write-scope | 0105 | ✅ |
| 4 | #64 | Pricing P-a — engine + resolver + history | 0106 | ✅ |
| 5 | #65 | Pricing P-b — UI + order/invoice integration + override (pilot-first) | — | ✅ |
| 6 | #66 | UX-1 — Settings navigation grouping | — | ✅ |
| 7 | #67 | UX-4 — import manual-first | — | ✅ |
| 8 | #68 | UX-2 — FormSection + customer field grouping | — | ✅ |
| 9 | #69 | UX-3 — mobile bottom-nav + card lists | — | ✅ |
| 10 | #70 | UX-5 — page templates + empty-state CTAs | — | ✅ |
| 11 | #71 | Pilot Readiness Review + FMCG demo seed (docs/data) | — | ✅ |
| 12 | #72 | Pilot hardening — permissions + validations (+ walkthrough D1/B1) | 0107, 0108 | ✅ |
| 13 | #73 | Pilot walkthrough + final Go/No-Go (docs) | — | ✅ |

> Migrations introduced by the stack: **0103, 0104, 0105, 0106, 0107, 0108** — all
> additive/idempotent, staging-applied, **held from production**.
> Walkthrough fixes **D1** (rep self-assigns on customer create) and **B1** (Import
> access for Sales Director/NSM, migration 0108) are **closed** in #72.

## 2. Merge order (recommended)
Merge **bottom-up, one at a time**, into `claude/company-roles-permissions`:
1. Mark each PR **Ready** (out of draft), confirm green, **Merge #61**, delete its
   branch. GitHub **auto-retargets** #62's base to `claude/company-roles-permissions`.
2. Repeat for **#62 → #72** in order (each retargets the next on merge+delete).
3. Re-run CI on each as its base updates (the stack is linear, so conflicts are
   unlikely; if a later PR shows drift, rebase it on the new base).
4. Finally, open **`claude/company-roles-permissions` → `main`** and merge once
   green. (Or keep the program on `company-roles-permissions` until pilot sign-off.)

> Alternative (faster, less granular): since the stack is linear, merging the tip
> (#72) into `claude/company-roles-permissions` brings the whole chain at once —
> but PR-by-PR preserves review/history. Recommend PR-by-PR.

## 3. Production migration plan (after merge + your go-ahead)
Apply **in order** to the pilot tenant's project, each rolled-back-verified first
(the pattern used throughout): `0103 → 0104 → 0105 → 0106 → 0107 → 0108`.
- 0103/0104/0105 carry the rolled-back-live evidence in their PRs; re-verify on the
  pilot project before the real apply.
- None drop or rewrite data; all are `ADD COLUMN IF NOT EXISTS` / additive RLS /
  additive permission rows.
- After migration: run `supabase/demo/fmcg_demo_seed.sql` on the **demo** project
  only (never production).

## 4. Final Go / No-Go checklist
**Code & tests**
- [x] All 12 PRs green (typecheck/build, unit, integration DB, Playwright, staging migrate)
- [x] RLS hierarchy scope verified live per role (S4a/S4b DB tests)
- [x] Pricing resolver verified live (P-a DB test)
- [x] Pilot hardening applied (permissions + validations) + tested

**Pilot enablement**
- [x] FMCG demo dataset prepared (`fmcg_demo_seed.sql`)
- [x] Onboarding seeds roles/modules/customer master data for wholesale/delivery
- [x] Import manual-first + per-company templates; mobile customers/invoices

**Hold items (require explicit go-ahead)**
- [ ] Merge the stack (#61 → #72) per §2
- [ ] Apply migrations **0103–0107** to the pilot tenant per §3
- [ ] Run the demo seed on the demo project
- [ ] Scripted end-to-end smoke per role (admin, sales_director, regional, rep) on the demo tenant

**Deferred (post-pilot, agreed)**
- Pricing **P-c** (promotion pricing) + **S5** promotions
- **S3b** role-label customization
- **Trade Spend**
- UX nice-to-haves: default price list per company; roll card-list to products/orders

## 5. Pilot deployment checklist (run after merge sign-off)
Execute top-to-bottom on the **pilot/demo** Supabase project (never production
until final approval):
1. **Merge** the stack per §2 (bottom-up, #61 → #73) into `claude/company-roles-permissions`.
2. **Back up** the pilot project (DB snapshot) before any migration.
3. **Apply migrations** `0103 → 0108` in order (§3), each rolled-back-verified
   first; confirm advisors show 0 ERROR after each.
4. **Smoke the schema** — `erp_customers` new columns present; `erp_customer_lookups`/
   `erp_price_rules`/`erp_price_change_log` exist; RLS enabled.
5. **Seed demo data** — run `supabase/demo/fmcg_demo_seed.sql` (and optionally
   `fmcg_demo_users_and_data.sql`); set `reports_to` + region/area `manager_id` on
   demo users to demo S4 scope.
6. **Per-role smoke** (the live walkthrough): sign in as admin · sales_director ·
   regional_manager · supervisor · salesman and confirm: scoped customer lists,
   Pricing + Import reachable for leadership, a rep creates a customer (self-assign)
   + an order + an invoice, price resolves, override audited, mobile cards + bottom nav.
7. **Sign-off** → only then schedule the **production** migration `0103–0108`
   (still a separate, guarded, approved step).

## 6. Verdict
**GO for pilot** once §5 is completed. The platform is feature-complete for the
FMCG pilot, scoped and validated, with demo data, onboarding, and the walkthrough
fixes (D1/B1) in place — simple by default, enterprise depth on demand. Production
migrations remain **on hold** pending your final pilot approval.
