# Principal Intelligence Layer (PIL) — Detailed Design Review Package

**Status:** Design review first. **No approval or implementation** until this package is signed
off. This is the deep companion to the PIL **proposal** (`PRINCIPAL_INTELLIGENCE_LAYER_PROPOSAL.md`,
#239): it carries the concrete schema, read-model contracts, the external-portal threat model,
phasing with acceptance criteria, the open decisions a reviewer must resolve, and a sign-off
checklist.

> Reminder of intent: PIL is the FMCG **commercial-intelligence** domain centered on *principals*
> (the brand owners a distributor represents). It is ~70–80% **composition** of engines that
> already exist; the genuinely new pieces are the *principal* dimension, principal-scoped
> read-models/snapshots, and (optionally, later) a governed external portal.

---

## 1. Decisions the reviewer must resolve (gating)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Product→principal link | (a) mapping table `erp_product_principals`; (b) nullable `principal_id` on `erp_products_catalog` | **(a)** — avoids touching the hot catalog table; supports multi-source/private-label |
| D2 | Snapshot grain | per `(principal, period)`; +territory? +channel? | start `(principal, period[, territory])`; add channel later |
| D3 | Internal access permission | new `principal.view`; or reuse `report.aggregate.view` | **new `principal.view`** (clean, auditable), seeded to commercial roles |
| D4 | External portal in scope now? | yes / later / never | **later** — separate security-reviewed initiative (PIL-E) |
| D5 | Forecast-accuracy source | reuse `commercial` forecasting vs new metric | reuse `commercial` (no new forecasting) |
| D6 | Trade-spend ROI definition | claimed/accrued vs sell-out uplift | phase-1 = accrued/claimed/open-liability/cap (reuse trade-spend summary); uplift later |
| D7 | Snapshot compute cadence | nightly cron vs on-demand | nightly via a `/api/internal/principal-snapshot` tick (reuse kpi-snapshot pattern) |

Nothing below is built until D1–D7 are agreed.

## 2. Data model (proposed DDL sketch — additive, company-scoped RLS)

All tables: `company_id` FK + canonical RLS (`erp_is_platform_owner() OR company_id =
erp_user_company_id()`), FK-covering indexes (first index col = FK col), `created_at`, audit.

```sql
-- The principal (brand owner) dimension.
erp_principals (
  id uuid pk, company_id uuid fk, code text, name text, name_ar text,
  is_active boolean default true, created_at timestamptz )
  -- idx (company_id), unique (company_id, code)

-- SKU → principal mapping (D1 option a).
erp_product_principals (
  id uuid pk, company_id uuid fk, product_id uuid fk, principal_id uuid fk,
  created_at timestamptz )
  -- idx (company_id, product_id), idx (principal_id), unique (company_id, product_id)

-- Immutable periodic roll-ups (SELECT + INSERT only; no UPDATE/DELETE policy).
erp_principal_kpi_snapshots (
  id uuid pk, company_id uuid fk, principal_id uuid fk,
  period date, territory_id uuid null,
  coverage_pct numeric, msl_compliance_pct numeric, perfect_store_score numeric,
  oos_rate_pct numeric, trade_accrued numeric, trade_claimed numeric,
  trade_open_liability numeric, cap_utilization_pct numeric,
  forecast_accuracy_pct numeric, sell_in numeric, numeric_distribution_pct numeric,
  weighted_distribution_pct numeric, created_at timestamptz )
  -- idx (company_id, principal_id, period), idx (principal_id)

-- (PIL-E only, separate approval) governed external access.
erp_principal_portal_access (
  id uuid pk, company_id uuid fk, principal_id uuid fk, contact_user_id uuid,
  effective_from timestamptz, effective_to timestamptz, expired_at timestamptz null,
  granted_by uuid, created_at timestamptz )
  -- mirrors the temp-access + expiry-sweep pattern (0227 + 0237)
```

No changes to existing tables (D1 keeps the catalog untouched). All additive.

## 3. Read-model contracts (pure, composing existing engines)

A `src/lib/principal-intel/` pure layer (engine-first, unit-tested, no I/O):

- `principalScorecard(rows): PrincipalScorecard` — folds the snapshot row(s) for a principal/period
  into headline KPIs (+ trend vs prior period). Pure.
- `gapAnalysis(mslRows, oosRows, coverageRows, principalId): Gap[]` — MSL gaps / OOS hotspots /
  under-covered outlets for the principal's SKUs, reusing the MSL/assortment + route-intel
  read-models (no new business rules).
- `qbrPack(scorecard, gaps, period): QbrPack` — assembles the exportable business-review payload
  (reuses the raw-data export + report/print patterns).

Each metric **drills to source** via the existing `attribution` raw-data rows, so every number is
defensible in a principal QBR.

## 4. Compute / snapshot job

- `/api/internal/principal-snapshot` (CRON_SECRET-guarded, service client) — nightly, computes
  `erp_principal_kpi_snapshots` per `(principal, period[, territory])` by aggregating existing
  engine outputs along the product→principal mapping. Reuses the exact pattern of the existing
  `kpi-snapshot` tick. Cheap reads thereafter. Structured-logged + alert-on-failure (Step 2 obs).

## 5. Surfaces

- **Internal (PIL-C):** `/distribution/principal-intel` (or `/principals`) — list principals →
  scorecard per principal (period + territory filters) → drill to source; `principal.view`-gated;
  `KAKO_PRINCIPAL_INTEL` flag. QBR export button.
- **External (PIL-E, deferred):** a separate read-only `/portal/principal` surface, single-
  principal scoped per contact via `erp_principal_portal_access` — **not** in the initial build.

## 6. External-portal threat model (PIL-E — informs the later separate review)

Principals are **external** parties; the portal is the highest-risk element, hence deferred.
Threats + required controls (to be satisfied at PIL-E review):

| Threat | Control |
|---|---|
| Cross-principal data access | RLS scoping a contact to exactly one `principal_id`; every query filtered + tested |
| Cross-tenant leakage | company-scoped RLS on top of principal scoping; cross-tenant tests |
| Stale/over-long access | `effective_to` + `expired_at` sweep (reuse 0237); temp-access pattern |
| IDOR on portal endpoints | object-level authz on every read; no client-supplied principal_id trust |
| Data exfil via export | export scoped + rate-limited + audited |
| Auditability | every portal read audited (actor, principal, rows) |
| No writes | portal is strictly read-only (no principal-facing mutations) |

PIL-E ships only after a dedicated security review (per the Formal Security Review §8 #5).

## 7. Phasing + acceptance criteria

| Phase | Scope | Acceptance |
|---|---|---|
| PIL-A | `erp_principals`, `erp_product_principals`, pure read-models | engine unit-tested; "unmapped SKUs" report; no UI; additive migration applies clean |
| PIL-B | `erp_principal_kpi_snapshots` + nightly tick | snapshots computed; reads cheap; obs-instrumented |
| PIL-C | internal scorecard UI + QBR export (`KAKO_PRINCIPAL_INTEL`) | `principal.view`-gated; drill-to-source works; ar/en |
| PIL-D | gap/opportunity surfacing (optionally explained via 8G) | gaps reconcile with MSL/route-intel |
| PIL-E | external portal (`KAKO_PRINCIPAL_PORTAL`) | **separate security review**; threat-model §6 satisfied |

## 8. Relationship to Phase 8G (AI Insights)

8G is the **horizontal** explainability/Q&A engine over all read-models; PIL is the **vertical**
principal domain. PIL-D *consumes* 8G for "why" explanations. Recommended sequencing: **8G before
PIL-D**; PIL-A→PIL-C can proceed independently. No duplication — PIL owns the principal dimension,
8G owns explanation.

## 9. Multi-tenant, governance, audit, flags (summary)

Company-scoped RLS throughout; immutable snapshots (SELECT/INSERT-only); `principal.view` (D3)
for internal, single-principal RLS for the portal; all snapshot/portal reads audited; flags
`KAKO_PRINCIPAL_INTEL` + `KAKO_PRINCIPAL_PORTAL` independent, default OFF. Honors the standing
DO-NOT-START list (no ERP financial-suite / CRM pipeline / MRP).

## 10. Sign-off checklist (what approval means)

- [ ] D1–D7 decided.
- [ ] Schema (§2) accepted (additive, RLS, FK-coverage, immutability for snapshots).
- [ ] Read-model contracts (§3) accepted as pure compositions (no new business rules).
- [ ] Internal-only scope for the first build (PIL-A→PIL-D); **PIL-E deferred** to its own review.
- [ ] Permission model (`principal.view`) + flags accepted.
- [ ] Sequencing vs 8G accepted.

**On sign-off:** begin **PIL-A** (engine + registry, pure, engine-first) under the standard
discipline — additive migration, flag default OFF, integration tests before merge.
