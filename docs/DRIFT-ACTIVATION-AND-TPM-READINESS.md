# VANTORA — Drift Activation Roadmap + TPM Readiness

> Deployment record, the **staged plan to activate the FMCG capabilities that are
> built-but-dark in production**, a verified hidden-capability inventory, a
> value/risk-ordered rollout, and a Trade Spend (TPM) readiness assessment.
> **Planning only — no production data/schema change in this document.** Prepared
> `2026-06-04`. Builds on (does not duplicate) the Drift Closure Program (#111).

## 1. Deployment plan — executed ✅
Merged the five PRs into `main` in two dependency-ordered merge commits
(conflicts on `navigation.ts` + i18n `index.ts` resolved by keeping **both**
stacks' additions):

| Commit | Brings | PRs |
| --- | --- | --- |
| `0ff0589` | Import Engine Extension + Customer Onboarding | #113, #114 |
| `f21904e` | Retail Execution Core + Dashboards + Outlet Grading | #117, #118, #119 |

Gate before push: `tsc` clean · **586 tests** · `next build` OK. Pushed `main`
(`f21904e`) → production deploy building. All five PRs auto-closed as **merged**.

> **Important:** these merges ship **code only**. The new modules (FK import,
> onboarding rollback, MSL matrix, dashboards, grading) and the older FMCG depth
> render **defensive empty states** in production until their migrations are
> applied. Activation = §3.

## 2. Hidden-capability inventory (verified read-only against production)
`✅ live` · `🌒 built-but-dark` (migration in repo, not applied).

| Focus area | Backing (migration) | Prod today | Status |
| --- | --- | --- | --- |
| **Targets** | `erp_targets` + `erp_target_achievement()` (`0139`) | absent | 🌒 dark (legacy `erp_rep_targets` ✅ live) |
| **Visits / GPS** | `erp_visits.check_in_at…` (`0128`), `erp_check_in_visit()` | absent | 🌒 dark |
| **GPS Compliance** | `erp_visit_compliance` (`0131`) | absent | 🌒 dark |
| **Journey** | `erp_journey_plans`, `erp_route_customers`, `erp_today_journey()` (`0129`) | absent | 🌒 dark |
| **Route Execution** | depends on visits+journey (`0128/0129`) | — | 🌒 dark (screen renders empty) |
| **Customer segmentation** | `erp_customer_lookups`, `erp_customers.segment_id…` (`0103`) | absent | 🌒 dark |
| **Pricing engine** | `erp_price_rules` (`0106`), `erp_product_uoms` (`0137`) | absent | 🌒 dark |
| **Retail Execution (MSL)** | `erp_msl_*` (`0144`) | absent | 🌒 dark (just merged) |
| **Outlet Grading** | `erp_outlet_grades…` (`0145`) | absent | 🌒 dark (just merged) |
| Regions / Areas | `0101` | present | ✅ live |
| Work sessions | (≤`0102`) | present | ✅ live |

**Net:** the entire FMCG field-execution + pricing + targets + retail-execution
stack is **built and merged but dark in prod** — gated only by the unapplied
migrations `0103, 0104–0117, 0119, 0121–0145` (≈40 files). Activation is a
**release/ops task, not a build task** — the single highest-leverage action open.

## 3. Staged drift activation roadmap
Constraints (from the Drift Closure Program): production uses a **timestamp**
`schema_migrations` scheme while the repo uses `00XX_`, so a blind `supabase db
push` / `migrate` is a **NO-GO** (it would re-replay or mis-order). Apply in
**explicit dependency order**, each file individually, after a staging dry-run.

**Stage 0 — Safety & registry (do once, before anything):**
1. Confirm **PITR** is enabled + take a fresh restore point (rollback path).
2. Create a **Supabase preview branch** (staging) from prod schema.
3. Reconcile the `schema_migrations` version scheme (register the `00XX_` files
   that are *already* applied, e.g. 0101/0102, so the apply tool won't re-run
   them). This is the one prerequisite that unblocks everything.

**Stages (each independently shippable + valuable):**

| Stage | Migrations (in order) | Activates | Value | Risk |
| --- | --- | --- | --- | --- |
| **A · Customer Model** | `0103,0104,0105` | Segmentation, dynamic lookups, scoped RLS | High (unlocks MSL/grade targeting) | Med (RLS scope change — test visibility) |
| **B · Pricing** | `0106,0137,0138` | Pricing engine, UOM, van reconciliation | High | Med (price resolution path) |
| **C · Field Ops** | `0128,0129,0131,0132` | Visits GPS, Journey, GPS compliance, Day-close → **Route Execution lights up** | Very high | Med-High (check-in writes + RLS) |
| **D · Targets** | `0133–0136,0139,0140–0143` | Targets + achievement, return reasons, search | High | Med |
| **E · Retail Execution** | `0144,0145` | MSL Matrix, dashboards, Outlet Grading | High | Low (purely additive, no existing-table change) |
| **(misc)** | `0107–0117,0119,0121–0125` | governance/field-config/index residue | Med | Low |

**Per-stage protocol:** apply on staging (in order) → run app smoke tests +
`get_advisors` (security/perf) → schedule a low-traffic window → apply same files
to prod via `apply_migration` (one file at a time, halt on first error) → smoke
test the activated screens → keep PITR point until verified.

**Recommended sequence (value × low risk first):**
`Stage 0 → E (additive, safest, lights up the brand-new retail layer) → A → C
(biggest field-ops value) → B → D → misc.`
(E before A/C is defensible because E's tables are standalone-additive; but the
retail *data* only becomes meaningful once A provides segments and C provides
visits — so if you want immediate business value, run **0 → A → C → E**.)

## 4. Rollout plan ordered by business value & risk
| Rank | Activate | Business value (KPI) | Impl. risk | Why this order |
| --- | --- | --- | --- | --- |
| 1 | **Stage 0** (PITR + staging + registry) | unblocks all | low | mandatory prerequisite |
| 2 | **Field Ops (C)** | coverage, strike rate, GPS compliance, route productivity | med-high | the operational backbone reps use daily; lights up Route Execution + Journey already shipped |
| 3 | **Customer Model (A)** | segmentation → targeted MSL/pricing/grades | med | unlocks the dynamic dimensions the retail layer needs |
| 4 | **Retail Execution (E)** | MSL compliance, distribution %, OOS, Perfect Store, grading | low | additive + already merged; becomes meaningful after A/C |
| 5 | **Pricing (B)** | price compliance, promo-ready execution | med | prerequisite for TPM price execution |
| 6 | **Targets (D)** | quota achievement, run-rate/forecast | med | management visibility |
| 7 | misc residue | governance/config | low | cleanup |

## 5. TPM (Trade Spend Management) readiness assessment
**Goal:** budgets → promotions (mechanics) → accruals → claims/deductions → **ROI
vs actual sales** (closed loop) — the one major FMCG module still missing.

**What already exists to reuse (no duplication):**
- `public.promotions` (`0002`) — basic promo header (dates, channels, product_ids,
  trade_spend, expected/actual ROI). **Extend, don't recreate.**
- `ts_*` trade-spend platform (`0004`) — a **siloed** distributor campaigns model.
  Decide: migrate its concepts into the ERP-integrated model, or retire it.
- **Pricing engine** (`0106`) has an **unfilled promotion slot #1** → the native
  hook for promo **price execution** (BOGO/%/threshold). Reuse once Stage B is live.
- **Dynamic MSL Matrix engine** (`0144`) — its policy/condition/lookup pattern is a
  ready-made template for **promo eligibility targeting** (which outlets/segments/
  channels/grades a promo applies to). Reuse the engine, not a new one.
- **Outlet grades** (`0145`) + **segments** (`0103`) → promo targeting dimensions.
- `erp_invoices` + lines + `erp_payments` → the **actuals** for ROI / deduction
  reconciliation.

**What TPM needs (new, additive):**
- `erp_trade_budgets` (period × scope × amount; scope via the same dynamic lookups).
- `erp_promotions` proper: mechanics (type, discount/BOGO/threshold), eligibility
  (reuse matrix-style conditions), funding source (budget link), status/dates.
- `erp_promotion_accruals` (committed spend) + `erp_promotion_claims` /
  `erp_deductions` (settlement).
- ROI = accrued/claimed spend vs invoice uplift (derived; no new fact table).

**Readiness verdict:** **High.** The hard, reusable foundations — dynamic
targeting (MSL matrix), price execution hook (pricing engine), actuals (invoices/
payments), segmentation + grades — are all built. TPM is mostly **assembly +
4 additive tables + a closed-loop ROI calc**, not greenfield. **Hard dependency:**
TPM price execution needs **Stage B (pricing)** active; promo targeting is far
richer with **A (segments)** + **E (grades)** active. So TPM should follow drift
activation, reusing the dynamic-dimension engine and the pricing slot.

**Recommended TPM phasing (next module):**
1. `erp_promotions` (mechanics) + eligibility via the matrix engine + calendar UI.
2. Wire pricing slot #1 → automatic promo price at order/POS (needs Stage B).
3. `erp_trade_budgets` + `erp_promotion_accruals`.
4. Claims/deductions + **ROI dashboard** (spend vs invoice uplift) — reuses the
   retail-exec rollup engine for by-dimension ROI.

---
*Planning only. Reuses the dynamic dimension/matrix, pricing, segmentation, grade
and invoice foundations already shipped; no duplicate functionality. Drift
activation is an ops task gated on PITR + staging; TPM is the recommended next
build, assembled on the existing engines.*
