# Phase 8 — Master Index & Decision Matrix

**Purpose:** one place to review and sign off the Phase 8 design briefs. Every brief is
**design-review-first** — additive, flag-gated default OFF, multi-tenant RLS, audit-first,
reuse-first. **Nothing is implemented.** Implementation of each phase begins only after its
brief is signed off, then proceeds engine-first (additive migrations, flags OFF, integration
tests before merge).

## Approved implementation order

`8A → 8D → 8E → 8F → 8C → Drag-and-Drop → 8B → 8G → 8I → 8H → 8J`

## Brief index

| Phase | Brief | Flag | Class |
|---|---|---|---|
| 8A Workflow Builder | `PHASE_8A_WORKFLOW_BUILDER_DESIGN_BRIEF.md` | `KAKO_WORKFLOW_BUILDER` | Core |
| 8D Rule Engine | `PHASE_8D_RULE_ENGINE_DESIGN_BRIEF.md` | `KAKO_RULE_ENGINE` | Core |
| 8E Notification Center | `PHASE_8E_NOTIFICATION_CENTER_DESIGN_BRIEF.md` | `KAKO_NOTIFICATION_CENTER` | Core |
| 8F Form Builder | `PHASE_8F_FORM_BUILDER_DESIGN_BRIEF.md` | `KAKO_FORM_BUILDER` | Core |
| 8C Report Builder | `PHASE_8C_REPORT_BUILDER_DESIGN_BRIEF.md` | `KAKO_REPORT_BUILDER` | Core |
| Drag-and-Drop framework | `DRAG_AND_DROP_FRAMEWORK_DESIGN_BRIEF.md` | `KAKO_DND_FRAMEWORK` | Infra |
| 8B Dashboard Builder | `PHASE_8B_DASHBOARD_BUILDER_DESIGN_BRIEF.md` | `KAKO_DASHBOARD_BUILDER` | Core |
| 8G AI Insights | `PHASE_8G_AI_INSIGHTS_DESIGN_BRIEF.md` | `KAKO_AI_INSIGHTS` | Core (premium) |
| 8I Asset Management | `PHASE_8I_ASSET_MANAGEMENT_DESIGN_BRIEF.md` | `KAKO_ASSET_MGMT` | Pack |
| 8H Fleet Management | `PHASE_8H_FLEET_MANAGEMENT_DESIGN_BRIEF.md` | `KAKO_FLEET_MGMT` | Pack |
| 8J Procurement Pack | `PHASE_8J_PROCUREMENT_PACK_DESIGN_BRIEF.md` | `KAKO_PROCUREMENT_PACK` | Pack |

Plus the cross-cutting **Principal Intelligence Layer**: proposal
(`PRINCIPAL_INTELLIGENCE_LAYER_PROPOSAL.md`) + detailed design-review package
(`PRINCIPAL_INTELLIGENCE_LAYER_DESIGN_REVIEW.md`, with the D1–D7 decision matrix).

## Decision matrix

(Business value / complexity scores carried from the approved Phase 8 proposal #222; reuse % and
risk summarized from each brief.)

| Phase | Value | Cmplx | Reuse | Key dependency | Primary risk | Sign-off |
|---|---|---|---|---|---|---|
| 8A Workflow Builder | High | M | ~70% | workflow engine (exists) | `api_call` SSRF/egress | ☐ |
| 8D Rule Engine | Med-High | M | ~60% | workflow `condition-eval` | overlap w/ tax/pricing/commission | ☐ |
| 8E Notification Center | Med-High | M | ~60% | notifications + dispatcher + Hub | spam/PII in templates | ☐ |
| 8F Form Builder | High | M | ~70% | custom fields + survey engine + offline (Step 1) | governance bypass; survey fork | ☐ |
| 8C Report Builder | High | M-H | ~55% | entity registry + raw-data export | **RLS bypass / SQL injection / export exfil** | ☐ |
| Drag-and-Drop | Med | M | ~40% | mature DnD lib | a11y/RTL regressions; lib lock-in | ☐ |
| 8B Dashboard Builder | High | M | ~60% | **DnD + 8C** | cross-tenant via widget | ☐ |
| 8G AI Insights | High | H | ~50% | copilot + attribution + commercial | **cross-tenant leakage; grounding; provider data-handling** | ☐ |
| 8I Asset Mgmt | Med | M | ~50% | attachments/offline-media/forms | fixed-asset-accounting scope creep | ☐ |
| 8H Fleet Mgmt | Med | M-H | ~45% | van/route-costing (0229) | telematics scope; driver PII | ☐ |
| 8J Procurement | Med | M-H | ~55% | Phase 2 purchasing + 8A | MRP/financial-suite scope creep | ☐ |

## Cross-cutting guardrails (apply to every phase)

- **DO-NOT-START boundary** honored throughout: no ERP financial-suite expansion, CRM pipeline,
  MRP/manufacturing, or general-ERP-replacement (8J/8I/8H explicitly stop short of GL/MRP).
- **Security-critical phases** (8C safe-query compiler, 8G grounding/RLS, 8B widget sourcing)
  ship **engine-first with a cross-tenant test before any UI**.
- **Field-governance** is honored via a single resolution path in every phase that renders/writes
  fields (8A/8F/8C/8B) — no parallel field-access.
- **Offline** scope is limited to what the Step 1 server-authoritative pattern supports (forms/
  surveys/media/asset-audits/fuel entry); financial/inventory writes (orders/returns/stock,
  procurement, approvals) stay online-only pending dedicated design.
- **DnD before 8B**; **8C before 8B** widgets; **8A before 8J**; **8G pairs with PIL-D**.

## Per-phase sign-off = approval to implement

Checking a phase's box authorizes implementation of *that* phase (engine-first, flagged OFF). The
recommended path is to sign off in the approved order; security-critical cores (8C/8G) and the
external surfaces (PIL-E portal) each get their own focused review at implementation time.

## Status

- ✅ All 11 Phase 8 briefs + the PIL proposal/design-review package authored and merged (docs).
- ⏳ **Awaiting design-review sign-off** before any Phase 8 / PIL implementation.
- Pilot foundation already shipped: Step 1 (mobile/offline) + Step 2 (pre-pilot hardening, GO for
  controlled pilot) are complete.
