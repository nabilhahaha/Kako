# VANTORA Architecture Index

**Status:** Master index v1 — _design only_. No code, no schema, not merged, not deployed.
**Purpose:** The single entry point to the platform architecture package finalized before Phase 1 (Seeder). Points to every spec, states how they fit, and fixes the **dependencies** and **build order**. It does not restate the specs — each link is authoritative for its own domain.
**Rule of precedence:** for cross-cutting matters (vocabulary, build order, duplication, currency boundary) `ARCHITECTURE-ALIGNMENT.md` wins; for domain depth, the domain spec wins; this index only routes.

---

## 1. The package at a glance

| Ref | Artifact | Doc | Branch | Tier | Kind | Status |
|---|---|---|---|---|---|---|
| **#84** | Provider Cockpit | _(code)_ + `fx-rates.ts` | `claude/provider-panel-cockpit` | **Platform** | Built code | implemented |
| **#85** | Authorization Model | `AUTHORIZATION-MODEL.md` | `claude/authorization-model-spec` | Tenant | Spec | v1.4 (design) |
| **#86** | Pilot Simulation + FMCG | `PILOT-SIMULATION-PLAN.md` | `claude/pilot-simulation-plan` | Tenant | Plan | v1.2 (design) |
| **#87** | Workspace & Dashboard Engine | `WORKSPACE-ENGINE.md` | `claude/workspace-engine-spec` | Tenant | Spec | v1.2 (design) |
| **—** | Architecture Alignment | `ARCHITECTURE-ALIGNMENT.md` | _(on #87)_ | Cross-cutting | Reference | v1 (design) |

> **Tier boundary:** #84 is the **platform/provider** tier (vendor staff, MRR/ARR in SAR). #85–#87 are the **tenant** tier. The boundary is normative (`AUTHORIZATION-MODEL.md` §13) — the provider FX seam and provider nav never cross into tenant logic.

---

## 2. How the pieces fit

```
                    ┌─────────────────────────────────────────────┐
   PLATFORM TIER →  │  #84 Provider Cockpit  (companies · billing · │
                    │  staff · audit · provider FX seam, base SAR)  │   ← isolated
                    └─────────────────────────────────────────────┘
   ───────────────────────────── tenant boundary (§13) ─────────────────────────────
                    ┌─────────────────────────────────────────────┐
   TENANT TIER →    │  #85 Authorization Model  (access SPINE)      │
                    │   capability × scope × constraint × field     │
                    │      ├── DFG (fields, built)                  │
                    │      └── Workflow engine (built) + amount-     │
                    │           routing = "Approval Matrix"         │
                    ├─────────────────────────────────────────────┤
   PRESENTATION →   │  #87 Workspace Engine  (widgets · personas ·  │
                    │   packs/templates) — gates THROUGH the spine  │
                    ├─────────────────────────────────────────────┤
   PROVING GROUND → │  #86 Pilot Simulation  (FreshLine, EGP) —     │
                    │   exercises the whole chain end-to-end        │
                    └─────────────────────────────────────────────┘
   CROSS-CUTTING →   ARCHITECTURE-ALIGNMENT (vocabulary · no-dup · order · FX base)
```

- **#85 is the spine.** Everything that touches access goes through it. DFG (built) is its field axis; the workflow engine (built) + amount-routing is its escalation arm (the "Approval Matrix" is not a separate engine).
- **#87 presents.** It never authorizes — it gates each widget/menu/action through #85 (`expandAliases()`/`can()`), is RLS-scoped at query time, and personas are layout-only.
- **#86 proves.** One realistic EGP tenant, real write paths, with a leakage hard-gate and FMCG scenarios; it validates #85 + #87 against real data.
- **Alignment** keeps the vocabulary single, forbids duplicate engines, and fixes the order below.

---

## 3. Dependency graph (cross-spec)

Edges mean "must exist before". (Authoritative copy: `ARCHITECTURE-ALIGNMENT.md` §3.)

```
Authz P1 (granular catalog + alias resolver)
   ├─► Authz P2/3 (split checks; per-assignment scope + RLS swap)
   │       └─► Sim: scope/leakage on the real predicate
   ├─► Workspace capability gating (resolve via expandAliases — F2)
   │       └─► Workspace P1–P7 (registry → resolution → Studio → packs)
   └─► DFG field-section binding (DFG already built) at Authz P5

Workflow engine (built)
   └─► conditional/amount triggers + discount/return/writeoff handlers
           └─► Authz P4 (constraints + amount-routing = "Approval Matrix")
                   └─► Sim: over-limit discount/return/writeoff approvals (F3)

batch/lot + expiry schema (NOT built)
   └─► inventory.expiry.view activates (F4)
           └─► Workspace near-expiry widget + Sim §9.2

erp_rep_targets (built)        ─► Target Achievement buildable now (F5)
erp_visits + erp_routes (built)─► Route Coverage buildable now
erp_promotions (designed only) ─► Workspace promo widgets + Sim §9.3 (F6)

#84 Provider Cockpit (platform) ── isolated; never merges into tenant Workspace
```

**Two hard sequencing rules**
1. **Workspace gating ships after Authz Phase 1** (else granular `requiredCapability` keys don't resolve).
2. **Sim approval scenarios (discount/return/writeoff) run after Authz Phase 4** (which needs the workflow trigger/handler extensions first).

---

## 4. Consolidated build order

| Step | Work | From | Gated on |
|---|---|---|---|
| 1 | Authz **P1** — granular catalog + alias resolver (code; dual-read) | #85 §15 | spec sign-off |
| 2 | Authz **P2** — split call-site checks | #85 §15 | step 1 |
| 3 | **Pilot Simulation** — Seeder → generator → invariants/accounting → scope/leakage (built flows) | #86 §10 | steps 1–2 (gating) |
| 4 | Authz **P3** — per-assignment scope + RLS swap + transitive `own_team` (benchmark first) | #85 §4/§15 | step 1 |
| 5 | Workspace **P1–P3** — widget registry + resolution + Studio | #87 §14 | step 1 (F2) |
| 6 | Workflow triggers/handlers + Authz **P4** — constraints + amount-routing ("Approval Matrix") | #85 §9.1/§15 | workflow engine (built) |
| 7 | **Sim** — approval scenarios (discount/return/writeoff) | #86 §3 | step 6 (F3) |
| 8 | Authz **P5/P6** — DFG binding + Permissions UI | #85 §15 | steps 1–4 |
| 9 | Workspace **P4–P7** — nav/quick-actions governance, personas, packs/templates | #87 §14 | step 5 |
| 10 | **Capability builds** (as scheduled): batch/lot+expiry → near-expiry; promotions engine; tasks/calendar | gap register | independent |

> **Next decision point:** **Phase 1 (Seeder)** — step 3 above. It only requires Authz P1 gating to be the target convention; the Seeder itself seeds masters + opening stock via real receipts and persists nothing in Track A.

---

## 5. Capability ledger (built vs designed vs gap)

Grounds the plans in reality (verified against the codebase).

| Built (production) | Designed-only | Gap / absent |
|---|---|---|
| Workflow engine (`erp_workflow_*`, `HANDLERS`) | Authz granular model (#85) | batch/lot + **expiry** schema |
| Permissions (flat `module.resource`) + per-company roles | Workspace engine (#87) | **tasks**; **calendar** schema |
| DFG (`erp_field_config/access`, templates) | Workspace **packs/templates** | trade-spend **claims** |
| Business-type **modules + role** seeds | **Promotions** (`erp_promotions` plan) | **weighted distribution** baseline |
| `erp_rep_targets`, `erp_visits`, `erp_routes` | per-tenant **FX base** for limits | — |
| `erp_record_payment` idempotency | — | — |
| #84 Provider Cockpit + provider FX seam | — | — |

Gaps are **documented, not blockers** — they feed the roadmap and are handled by the gap rule in #86 §9.5.

---

## 6. F1–F6 closure
All consistency-review findings are closed at the documentation level; index in `ARCHITECTURE-ALIGNMENT.md` §5. Summary: F1 currency base (tenant EGP vs provider SAR), F2 capability-key resolution + sequencing, F3 approval-phase sequencing, F4 dormant `inventory.expiry.view`, F5 Target Achievement buildable now, F6 promotions cross-reference.

---

## 7. Suggested reading order
1. **This index** — the map.
2. `ARCHITECTURE-ALIGNMENT.md` — vocabulary, no-duplication, build order.
3. `AUTHORIZATION-MODEL.md` (#85) — the spine.
4. `WORKSPACE-ENGINE.md` (#87) — presentation on the spine.
5. `PILOT-SIMULATION-PLAN.md` (#86) — how it's proven.
6. #84 Provider Cockpit — the (separate) platform tier.

---

## 8. Status
Architecture package is **internally consistent and design-complete** for the current scope. No code, schema, or behavior changes in any of these documents. **Phase 1 (Seeder) is the next decision point** and awaits explicit go-ahead.
