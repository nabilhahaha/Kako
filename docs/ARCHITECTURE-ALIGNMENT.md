# VANTORA Architecture Alignment

**Status:** Reference v1 — _design only_. No implementation, no schema, not merged, not deployed.
**Purpose:** The cross-cutting contract that keeps the platform architecture package internally consistent: a single **governance vocabulary**, the **build-order / dependency graph**, the **"no duplicate engines"** rule, and the **F1–F6 closure index** from the consistency review.
**Authority:** Where this document and a single-domain spec disagree on cross-cutting matters (vocabulary, build order, duplication), **this document wins**. Domain depth still lives in each spec.

Specs in scope:
- `AUTHORIZATION-MODEL.md` — access spine (capability × scope × constraint × field).
- `DYNAMIC-FIELD-GOVERNANCE.md` — field-level governance (built).
- `WORKSPACE-ENGINE.md` — presentation engine (dashboards/nav/quick-actions/workspace).
- `PILOT-SIMULATION-PLAN.md` — the proving ground.
- Workflow engine (built: `erp_workflow_*`, `HANDLERS`) and the Provider Cockpit (#84, platform tier).

---

## 1. Shared governance vocabulary

Three domains use **analogous but distinct** level vocabularies. They are intentionally different (different things being governed) — this table is the single map so they are never conflated.

| Domain | Governs | Levels | Inheritance |
|---|---|---|---|
| **DFG** (fields) | individual fields | `hidden · view · edit · required` | `none · inherit · inherit_locked` |
| **Authorization** (capabilities) | actions per role/user | tri-state `inherit · grant · deny` (deny wins) | role default → override |
| **Workspace** (layout elements) | widgets/menus/actions | `locked · default_on · default_off · hidden` | Pack → Company → Persona → User (`inherit`/`inherit_locked` analog) |

**Shared primitives across all three:**
- **Snapshot + inherit:** the `erp_field_templates` pattern (snapshot JSONB + `inherit`/`inherit_locked`) is the **one** template/snapshot mechanism. Workspace packs and any future "pack" reuse it — no parallel snapshot system.
- **Admin-lockout protection:** no configuration may lock `admin`/`it_admin` out of the surface that administers it (DFG rule, carried into authz and Workspace Studio).
- **Single audit pipeline:** every governance change (field, capability/scope/constraint/override, layout) writes to `erp_audit_logs` with actor / target / subject / before→after / reason / timestamp.
- **Safe default:** with zero config rows, every engine renders today's behavior (no regression).

---

## 2. No duplicate engines (anti-duplication rule)

A capability already modeled by one system must **not** be re-implemented under a new name.

| Tempting "new" thing | It already **is** | Rule |
|---|---|---|
| **Approval Matrix** | Authorization **constraints** (§5) × **workflow** steps/approvers (engine) | The matrix is the *config/visualization* over (limit × approver step). No parallel routing engine, limit store, or approver registry. (`AUTHORIZATION-MODEL.md` §9.2) |
| **Workspace Pack / Template** | `erp_field_templates` snapshot + inherit primitive | Reuse the snapshot/inherit mechanism; don't build a second one. (`WORKSPACE-ENGINE.md` §10) |
| **Persona** | an *experience archetype* over authz **roles** | Persona is **layout-only, never authorizes**; not a third RBAC axis. (`WORKSPACE-ENGINE.md` §5) |
| **Widget "permissions"** | authz capabilities via `expandAliases()`/`can()` | Widgets gate through the authz resolver; no separate permission check. (`WORKSPACE-ENGINE.md` §3, F2) |
| **Per-tenant FX for limits** vs **provider FX** | two *different* bases | Tenant limits normalize in the **tenant** base; the provider `fx-rates.ts` (SAR) is platform-tier only. (`AUTHORIZATION-MODEL.md` §5.3, F1) |

---

## 3. Build-order / dependency graph

Edges mean "must exist before". Each spec's own phases still gate individually; this is the **cross-spec** ordering.

```
Authorization Phase 1 (granular catalog + alias resolver)
   ├─► Authorization Phase 2/3 (split checks; per-assignment scope + RLS swap)
   │       └─► Pilot Simulation: scope/leakage (§4 #5/#7) on real predicate
   ├─► Workspace capability gating (resolve via expandAliases — F2)
   │       └─► Workspace Phases 1–7 (registry → resolution → Studio → packs)
   └─► (DFG already built — field binding plugs in at authz Phase 5)

Workflow engine (built)
   └─► Workflow conditional/amount triggers + discount/return/writeoff handlers
           └─► Authorization Phase 4 (constraints + amount-routing)
                   └─► Pilot Simulation: over-limit discount/return/writeoff approvals (F3)

batch/lot + expiry schema (NOT built)
   └─► inventory.expiry.view activates (F4)
           └─► Workspace near-expiry widget  +  Pilot Simulation §9.2 near-expiry

erp_rep_targets (built)  ─► Target Achievement calc/widget buildable now (F5)
erp_visits + erp_routes (built) ─► Route Coverage buildable now
erp_promotions (designed only, FMCG-HIERARCHY-CUSTOMER-PROMO-PLAN.md)
   └─► Workspace promo widgets + Pilot Simulation §9.3 (F6)

Provider Cockpit (#84, platform tier) ── isolated from tenant governance (never merges into Workspace)
```

**Two hard sequencing rules:**
1. **Workspace gating ships after Authorization Phase 1** (else granular `requiredCapability` keys don't resolve).
2. **Simulation approval scenarios (discount/return/writeoff) run after Authorization Phase 4** (which itself needs the workflow trigger/handler extensions).

---

## 4. Currency base (F1)
- **Tenant** operations + limits: each company's **base currency** (EGP for current companies). Limit normalization uses a per-tenant base via the same async FX accessor pattern.
- **Provider** revenue (MRR/ARR): `fx-rates.ts`, `FX_BASE_CURRENCY = SAR`, platform tier only.
- These never mix; the platform↔tenant boundary (`AUTHORIZATION-MODEL.md` §13) holds.

---

## 5. F1–F6 closure index
| Finding | Resolution | Where |
|---|---|---|
| **F1** Currency base/tier coupling | Tenant-base limit normalization; provider SAR seam is platform-tier | authz §5.3 + §4 here |
| **F2** Perm-key convention + sequencing | Gate via `expandAliases()`; Workspace depends on authz Phase 1 | workspace §3 + §3 here |
| **F3** Sim approvals depend on unbuilt phases | Discount/return/writeoff approvals are Phase-4-gated; built flows validated now | sim §3 + authz §9.1 + §3 here |
| **F4** `inventory.expiry.view` presented as current | Marked dormant pending batch/expiry schema (shared precondition) | authz §3.5 + sim §9.2 + workspace §4 |
| **F5** Target Achievement over-deferred | Buildable now on `erp_rep_targets`; no `targets` module | sim §9.4 + workspace §4 |
| **F6** Promotions divergence | Cross-reference promo plan; align `quantity_free`; claims = future addition | sim §9.3 |
| **§1c** Duplicate concepts | Anti-duplication rule (Approval Matrix, templates, persona, widget perms, FX) | §1–§2 here |

---

## 6. Status
All items are **documentation-level** and resolved across the specs above. No code, schema, or behavior changes. This reference governs cross-cutting consistency; update it (not the individual specs) when a cross-cutting decision changes.
