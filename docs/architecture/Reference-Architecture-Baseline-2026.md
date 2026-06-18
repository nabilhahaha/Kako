# VANTORA — Reference Architecture Baseline

**Status: APPROVED as the target platform direction.** This is the canonical reference
for future implementation planning. Two tiers below: **(A) Implemented & FROZEN** (live on
vantora-staging, do not change without a new decision) and **(B) Design-approved target**
(architecture accepted; not yet implemented).

_Owner branch (source of truth): `claude/fmcg-sell-collect-loop` (merged to `main`)._

---

## A. Implemented & FROZEN (authorization · RLS · hierarchy)

| Area | Decision (frozen) | Evidence / migration |
|---|---|---|
| **Roles — SoD** | Supervisor & Branch Manager are approvers, **not** transaction executors (no sell/collect/return/discount/settle); settlement = **Cashier/Accountant/Admin** only | `0335`, `0336`, `0337`; role review docs |
| **Collection Reverse** | Reverse gated on `accounting.post` (Finance/Admin); hidden+blocked for Sales Rep | Collection-Reverse fix |
| **Treasury / Cash Box** | `/cashbox` gated on new `treasury.manage` (Cashier/Accountant/Admin); Rep & Supervisor blocked (UI + direct URL) | `0336` |
| **Auditor** | Read-only (`audit.view` + reports) seeded globally | `0334` |
| **Day-close security** | `erp_day_close_try_close` revoked from PUBLIC/anon/authenticated | `0333` |
| **Data scoping P1** | Collections **rep/customer-scoped** (= invoices), not branch-wide | `0339` |
| **Data scoping P2/P3** | Customer & Cash-Handover requests: owner-sees-own + approver-scoped (not company-wide) | `0339` |
| **Hierarchy P4** | **Recursive `reports_to` subtree** (`erp_user_subtree`): Rep→own · Supervisor→direct+indirect reports · Area/Regional/Director→their subtree; **fallback-safe** (no reports ⇒ legacy branch) | `0340` |
| **Tenant isolation** | All data `company_id`-scoped under RLS | baseline |

**Validated:** per-role visibility matrix (Rep/Supervisor/Branch Mgr/Admin), recursion
proof (direct+indirect), SoD attestations, full test suite green, CI green.

**Canonical scope mechanism:** visibility reads the recursive `reports_to` tree —
**adding a management tier needs edges, not code.**

---

## B. Design-approved target (not yet implemented)

| Component | Intent | Reference doc |
|---|---|---|
| **Configurable Hierarchies** | Per-company, data-driven org + product hierarchies (`erp_org_levels/nodes`, `erp_product_levels/nodes`); no hard-coded levels | `Configurable-Hierarchies-Architecture-2026` |
| **Company Onboarding & Hierarchy Platform** | 7 builders (Onboarding Wizard · Org Structure · Product Hierarchy · Role Templates · User/Reporting · Multi-UoM · Industry Templates) | `Company-Onboarding-Hierarchy-Platform-Design-2026` |
| **Role Templates** | Versioned, per-company role/permission templates (reuse `erp_role_template_versions` + `erp_company_role_permissions`) | onboarding package §2.4 |
| **Responsibility model** | **Platform Owner** (companies/modules/billing/global security via migrations) vs **Company Admin** (own-company hierarchy/products/roles/UoM/reporting), with hard tenant-isolation guardrails | onboarding package §7 |
| **Org Structure Management UI** | Drag-drop org chart · `reports_to` mgmt · manager assignment · visualization · wizard integration | P4 doc roadmap |

### Governing principles (apply to all future implementation)
1. **Data over code** — levels, roles, UoM, edges are **configuration**, never hard-coded
   names (Supervisor/Brand/SKU…).
2. **One recursive tree** — `reports_to` is the single visibility mechanism for every
   manager tier (no per-role hard-coding).
3. **Tenant isolation is structural** — every config table `company_id`-scoped under RLS;
   global RLS/permission catalog changes only via migrations.
4. **Company-Admin self-service** — a non-technical admin configures the whole company from
   the UI; **Platform Owner** retains platform-wide control.
5. **Core UX principle** — business-friendly, non-technical, **wizard-driven, visual,
   guided, safe by default**; no RLS/tables/`reports_to`/permission-matrix internals
   exposed. Violations are defects.

---

## Index of approved artifacts (docs/audits + docs/architecture)
- Final Pilot Role & Permission Certification
- Supervisor / Cashier-Treasury role reviews + transaction-permission removal
- Collection-Reverse fix + Branch/Environment alignment
- Data-Scoping Audit; Remediation P1–P3 + P4 plan; **P4 Recursive Reports Scope** implementation
- Configurable Hierarchies Architecture
- **Company Onboarding & Hierarchy Platform** design package (incl. responsibility model + Core UX principle)
- Branch Inventory / Cleanup review package + workflow (cleanup still pending dry-run review)

## Change control
The **frozen** items (Section A) change only via a new, explicit decision + migration.
The **target** items (Section B) are the approved direction for implementation planning;
each will get its own implementation plan + validation when scheduled.

**This document is the reference architecture baseline. Approved.**
