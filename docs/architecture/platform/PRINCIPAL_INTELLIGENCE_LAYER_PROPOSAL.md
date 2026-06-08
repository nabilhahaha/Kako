# Principal Intelligence Layer (PIL) — Architecture Proposal

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive
migrations only · multi-tenant RLS · governance + auditability · feature-flagged default OFF.
Consistent with the Phase 7/8 proposal discipline.

> This is a **proposal document only**. It defines scope, architecture, data model, security,
> phasing, and a recommendation. It does not touch product code and is gated behind approval.

---

## 1. What a "Principal" is (and why this layer exists)

In FMCG distribution, a **principal** is the brand owner / manufacturer whose products a
distributor carries (e.g. a distributor represents P&G, Nestlé, Almarai…). The distributor's
commercial value to each principal is measured by **distribution quality** — numeric & weighted
coverage, must-stock-list (MSL) compliance, perfect-store execution, out-of-stock, trade-spend
ROI, sell-out vs sell-in, and forecast accuracy.

VANTORA's strategic positioning is a **specialized FMCG DMS / SFA / Trade-Spend / Commercial
Intelligence platform** (not an SAP/Dynamics replacement). The **Principal Intelligence Layer**
is the capability that makes the "Commercial Intelligence" claim concrete: a **principal-scoped,
explainable synthesis** of the signals VANTORA already computes, delivered to the distributor's
commercial team and — optionally, read-only — to the principals themselves.

It is the unifying *domain* on top of the engines we already shipped; it is **not** a new
analytics silo.

## 2. Relationship to existing work (reuse-first)

PIL is ~70–80% **composition of engines that already exist** — its net-new is the *principal
dimension*, the *principal-scoped read-models*, and (optionally) a *governed external portal*.

| Existing engine / data | PIL reuse |
|---|---|
| `perfect-store` (scorecards/scoring, 0231) | per-principal perfect-store compliance |
| `route-intel` (health snapshots, 0232; `erp_rep_day_kpis`) | coverage / adherence / strike-rate by principal's SKUs |
| `trade-spend` (promotions/accruals/claims, 0004/Phase 4) | trade-spend ROI & open liability **per principal** |
| `suggested-load` + `commercial` (forecasting, 0233) | demand & forecast accuracy per principal |
| `attribution` (raw-data rows, `explain`) | sell-in/sell-out attribution + drill-to-source |
| MSL / assortment (0144 retail execution, `settings/msl`) | distribution & MSL gaps per principal |
| territories (0215) | principal performance by territory |
| `erp_attachments` + GPS + surveys | proof-of-execution evidence per principal |
| Phase 8G **AI Insights** (proposed) | the *explainability/Q&A engine* PIL surfaces |

**Distinction from 8G (AI Insights):** 8G is a horizontal, explainable insight/Q&A engine over
all read-models. PIL is a **vertical FMCG domain** — the *principal* entity, principal-scoped
KPIs, scorecards, and (optionally) a principal-facing portal. PIL **consumes** 8G for "why"
explanations; 8G can ship first and PIL layers the principal dimension on top. They are
complementary, not duplicative.

## 3. Architecture (layers)

```
            ┌─────────────────────────────────────────────────────────┐
   Surface  │  Internal: Principal Scorecard / QBR pack / gap drilldown │
            │  External (opt): read-only Principal Portal (governed)    │
            └───────────────▲─────────────────────────▲────────────────┘
                            │                          │
   Intelligence   ┌─────────┴──────────┐   ┌───────────┴───────────┐
                  │ PIL read-models     │   │ 8G AI Insights (why)  │
                  │ (principal-scoped   │   │ explain / Q&A / risk  │
                  │  KPIs + scorecard)  │   └───────────────────────┘
                  └─────────▲───────────┘
                            │  (pure composition — no new business logic)
   Engines       perfect-store · route-intel · trade-spend · suggested-load ·
                 attribution · commercial/forecasting · MSL/assortment · territory
                            │
   Data (RLS)    erp_* operational tables  +  NEW: erp_principals, erp_product_principals,
                 erp_principal_kpi_snapshots, (opt) erp_principal_portal_access
```

PIL adds **no new business rules** — it *re-aggregates existing engine outputs along the principal
axis*. The only genuinely new primitives are the **principal entity** and the **product→principal
mapping** (one SKU belongs to one principal/brand owner).

## 4. Data model (additive, company-scoped RLS)

All tables follow the platform invariants: `company_id` FK + company-scoped RLS
(`erp_is_platform_owner() OR company_id = erp_user_company_id()`), FK-covering indexes
(first index column = FK column), `created_at`, audit via `erp_log_audit`.

- **`erp_principals`** — the brand owners a distributor represents
  (`id, company_id, code, name, name_ar, is_active, …`). The new core dimension.
- **`erp_product_principals`** — maps `product_id → principal_id` (company-scoped). The join that
  lets every existing SKU-level metric roll up by principal. (Alternative: a nullable
  `principal_id` column on `erp_products_catalog` — decide at design time; a mapping table avoids
  touching the hot catalog table and supports private-label/multi-source edge cases.)
- **`erp_principal_kpi_snapshots`** — periodic, **immutable** roll-ups (SELECT+INSERT-only
  policies) per `(company_id, principal_id, period, territory_id?)`: coverage %, MSL compliance,
  perfect-store score, OOS rate, trade-spend accrued/claimed/ROI, forecast accuracy, sell-in,
  numeric/weighted distribution. Mirrors `erp_rep_day_kpis` / `erp_intel_health_snapshots`
  patterns (compute-and-store, cheap reads).
- **(Optional, Phase 2 of PIL)** **`erp_principal_portal_access`** — governed external access:
  which external principal contact may read which principal's scoped data, with expiry +
  audit. Only introduced if the external portal is approved (see §6 — high security scrutiny).

No changes to existing tables beyond (optionally) the product→principal link. Fully additive.

## 5. Functional scope

**PIL Core (internal-facing — recommended first):**
- **Principal registry** + product→principal mapping (settings, `assortment.manage`-gated).
- **Principal Scorecard** — one screen per principal: coverage, MSL, perfect-store, OOS,
  trade-spend ROI, forecast accuracy, sell-in trend; period + territory filters; drill to source
  rows via `attribution`. Pure read-model over the snapshot + existing engines.
- **QBR / business-review pack** — exportable per-principal review (reuses raw-data export +
  existing report/print patterns).
- **Gap & opportunity surfacing** — MSL gaps, OOS hotspots, under-covered outlets for a
  principal's SKUs (reuses MSL/assortment + route-intel; optionally explained via 8G).

**PIL Portal (external-facing — optional, later, separate approval):**
- A **read-only**, heavily-governed view for principal contacts to see *their own* scorecard.
- Requires: per-principal data-scope isolation, temp-access expiry, full audit, no cross-principal
  or cross-tenant leakage, and an explicit security review. **This is the highest-risk piece and
  is deliberately deferred behind its own approval.**

## 6. Security, multi-tenancy, governance

- **Tenant isolation:** every PIL table is company-scoped RLS like the rest of the platform.
- **Principal scoping:** internal users see all principals for their company (gated by a new
  `principal.view` / reuse `report.aggregate.view`); the **external portal** (if built) scopes a
  contact to a *single* principal via `erp_principal_portal_access` + RLS — principals are
  **external parties**, so this gets the same scrutiny as Phase 8G ("no raw access to other
  tenants'/principals' data; every read RLS-scoped + audited").
- **Auditability:** snapshot generation and portal reads logged via `erp_log_audit`.
- **Governance:** principal registry + portal-access changes flow through existing approval/
  governance patterns where appropriate.
- **Explainability:** every PIL number must drill to its source rows (reuses `attribution`),
  so the scorecard is defensible in a principal QBR.

## 7. Feature flags (default OFF)

`src/lib/principal-intel/flags.ts` → `KAKO_PRINCIPAL_INTEL` (core) and a separate
`KAKO_PRINCIPAL_PORTAL` (external portal), both default OFF (`on(v)` = `'1'|'true'`). Core and
portal independently gateable so the external surface stays dark until separately approved.

## 8. Phasing (proposed)

1. **PIL-A — Engine + registry (pure):** `erp_principals`, `erp_product_principals`,
   `principal-intel` pure read-models composing existing engines; unit-tested; no UI. Additive
   migrations. *(Mirrors the engine-first pattern used for Phase 7.)*
2. **PIL-B — Snapshots:** `erp_principal_kpi_snapshots` + a compute job (reuses the KPI-snapshot
   pattern). Cheap reads for the scorecard.
3. **PIL-C — Internal scorecard UI + QBR export** (flag `KAKO_PRINCIPAL_INTEL`), permission-gated.
4. **PIL-D — Gap/opportunity surfacing**, optionally explained via 8G AI Insights.
5. **PIL-E — External Principal Portal** *(separate approval + formal security review;
   `KAKO_PRINCIPAL_PORTAL`)*.

## 9. Risks

| Risk | Mitigation |
|---|---|
| External principal data exposure (portal) | Defer to PIL-E behind its own flag + formal security review; per-principal RLS + temp-access + audit |
| Product→principal mapping data quality | Mapping table + import + a "unmapped SKUs" report; metrics degrade gracefully when unmapped |
| Snapshot/compute cost | Reuse the proven snapshot pattern (async, periodic, immutable); cheap reads |
| Overlap with 8G | Clear split: 8G = horizontal explainability engine; PIL = vertical principal domain that *consumes* 8G |
| Scope creep into ERP territory | Honors the DO-NOT-START list (no ERP financial-suite / CRM pipeline / MRP); PIL is pure commercial intelligence |

## 10. Non-goals (explicit)

- Not an ERP financial suite, CRM pipeline, MRP, or general-ledger expansion (honors the standing
  **DO NOT START** list until the approved roadmap completes).
- Not a replacement for 8G — it builds on it.
- No principal-facing *write* operations in the initial scope (read-only intelligence).

## 11. Recommendation

- **Sequence:** PIL fits **after Step 2 (pre-pilot hardening)** and naturally **pairs with / follows
  Phase 8G (AI Insights)** — 8G provides the "why", PIL provides the principal-scoped "what".
  Recommend: ship **8G first**, then **PIL-A→PIL-D** as the FMCG commercial-intelligence headline;
  treat **PIL-E (external portal)** as a separate, security-reviewed initiative.
- **Classification:** PIL Core = **core platform** (premium); PIL Portal = **optional pack**.
- **Why it matters:** PIL is the most direct expression of VANTORA's differentiated positioning —
  it converts the distribution/perfect-store/trade-spend engines we already have into the
  principal-facing commercial intelligence that distributors sell on. High strategic value,
  moderate complexity (mostly composition), low incremental risk for the internal core.

**Next step on approval:** begin **PIL-A** (engine + registry, pure, engine-first), then proceed
phase-by-phase under the standard discipline.
