# Admin Console — Architecture Review & Roadmap

**Status:** Direction-setting (pre-implementation). Capture for the Role Builder /
Admin Console roadmap. **No Role Builder implementation is in scope here.**

**Audience:** Company Admin (business owner / operations lead), not engineers.

---

## 1. Goal

A single, business-oriented **Admin Console** where a Company Admin can configure
how their company operates — **permissions, policies, approvals, and feature
flags** — **without understanding database tables, RPCs, or internal
implementation details**.

Different companies should be able to operate differently **through
configuration, not code changes**.

This codifies the platform's standing architecture principle:

> **Platform Capability → Company Policy → Role Permission**
>
> - The **platform** supports the capability (a feature flag / engine).
> - The **Company Admin** decides whether and how to use it (policy).
> - **Permissions** decide who can see or use it (roles).
>
> Avoid hardcoded business decisions.

The Return Approval Workflow (flag `platform.return_approval` → company policy
tables `erp_return_approval_policies` / `_rules` → `returns.*` permissions) is the
reference implementation of this pattern and should be the template for every
future configurable capability.

---

## 2. Problem with today's surface

Admin-related settings are spread across technical, flat screens (feature flags,
role grants, policy tables) that assume internal knowledge:

- Flat left navigation — no hierarchical drill-down by business concern.
- Feature flags presented as engineering keys, not business outcomes.
- Policies and approvals configured in separate, disconnected places.
- A Company Admin must know *where* a setting lives and *what table* it touches.

The console should reorganize all of this around **what the business wants to
do**, not **how the system stores it**.

---

## 3. Navigation model — hierarchical, business-oriented

The left navigation supports **hierarchical drill-down sections**, not a flat
menu. Eight top-level sections, each expanding to business-named sub-areas:

```
Admin Console
├── Organization        Company profile, branches, warehouses, routes, hierarchy
├── Users & Roles       People, role assignment, delegation, temporary access
├── Permissions         What each role can see/do (business language, not keys)
├── Policies            Approval thresholds, credit, returns, GPS/compliance, SLAs
├── Features            Capabilities ON/OFF (business outcomes, plan-aware)
├── Approvals           Approval workflows, queues, delegation, SLA dashboards
├── Integrations        E-invoicing, payment, external systems, data import/export
└── Audit               Who changed what, when; approval history; compliance trail
```

### Cross-cutting principles for every section
- **Business language first.** "Returns require approval above 500 SAR", not
  `erp_return_approval_rules.max_value`.
- **Drill-down, not flat.** Section → sub-area → entity → setting.
- **Plan & permission aware.** A capability the company's plan doesn't include is
  shown as an upgrade, not an error; a section the admin can't manage is hidden.
- **Read the effect, not the row.** Every policy screen states, in a sentence,
  what will happen ("VIP customers always require approval").
- **Safe by default.** Capabilities default OFF; turning one on reveals its
  policy and permission sub-settings inline.

---

## 4. Section responsibilities

| Section | Company Admin can… | Backed by (existing/typical) |
| --- | --- | --- |
| **Organization** | Manage company, branches, warehouses, routes, reporting hierarchy | `erp_companies`, `erp_branches`, `erp_warehouses`, routes |
| **Users & Roles** | Invite users, assign roles per branch, set delegation & temporary access | `erp_user_branches`, role governance, temp-access enforcement |
| **Permissions** | Review/adjust what each role may see or do, in business terms | `erp_company_roles`, permission catalog + aliases |
| **Policies** | Set thresholds & rules: approvals, credit limits, returns, GPS, balance/credit visibility | per-capability policy tables (e.g. return-approval policy/rules) |
| **Features** | Toggle capabilities ON/OFF; see plan tier & dependencies | `erp_feature_flags` + `feature-catalog` |
| **Approvals** | Configure approval workflows, view queues, manage delegation & SLA | approval policy/rules, SLA tracking flags |
| **Integrations** | Connect e-invoicing, payments, import/export | country-compliance, integration hub proposals |
| **Audit** | Trace changes & approvals for compliance | `erp_audit_log`, approval timestamps |

---

## 5. The capability contract (every configurable feature follows this)

For a capability to live cleanly in the Admin Console it must expose three
layers, each owned by a different audience:

1. **Platform Capability** — a feature flag in `feature-catalog.ts`
   (`P('platform.<key>', …)`), default OFF, with ar/en label + description in
   `messages/features.ts`. *Owned by the platform.* Surfaces in **Features**.

2. **Company Policy** — a per-company config table (mode, thresholds, ordered
   rules) read by a **pure resolver** (no I/O) so behaviour is testable and not
   hardcoded. *Owned by the Company Admin.* Surfaces in **Policies / Approvals**.

3. **Role Permission** — `module.resource.action` permissions in the catalog,
   mapped to roles, enforced by an always-on action gate. *Owned by the Admin via
   role assignment.* Surfaces in **Permissions**.

**Reference:** Return Approval —
`platform.return_approval` (capability) →
`erp_return_approval_policies` + `_rules` with `resolveReturnDecision` /
`canApproveReturn` pure resolvers (policy, incl. delegation + SLA) →
`returns.create | approve | reject | override | view_all` (permissions).

### Examples already aligned (or targeted) to this contract
- Return Approval ON/OFF — `platform.return_approval`
- Approval SLA Tracking ON/OFF — `platform.return_approval_sla`
- Damage Returns ON/OFF — (to formalize as a capability + policy)
- Warehouse Stock Visibility ON/OFF — permission-gated today; lift to capability
- GPS / Visit Compliance ON/OFF — capability + policy
- PDF Sharing ON/OFF — capability + permission
- Customer Balance Visibility ON/OFF — capability + permission
- Credit Limit Visibility ON/OFF — capability + permission

> **Roadmap note:** several of the above are enforced today only at the
> permission or code level. Migrating each to the full three-layer contract (so
> the Company Admin can self-serve them) is part of the Admin Console buildout —
> tracked, not implemented here.

---

## 6. Where Role Builder fits

Role Builder is the **Permissions** + **Users & Roles** experience of this
console: a business-language editor for "what can this role do", built on the
existing permission catalog and alias layer — **not** a raw grant table.

It must be designed *inside* this navigation model so it inherits the same
business-oriented, drill-down, capability-contract conventions. Therefore this
architecture review is a **prerequisite** to Role Builder implementation, per the
stated direction.

**Out of scope here:** building Role Builder, building the console shell, or
migrating any capability. This document only captures the target architecture and
principles so implementation can proceed against an agreed model.

---

## 7. Roadmap (sequencing, not commitments)

1. **R0 — This review** (done): navigation model + capability contract agreed.
2. **R1 — Console shell**: hierarchical left-nav, section routing, plan/permission
   gating, empty business-named sections.
3. **R2 — Features & Policies**: render `feature-catalog` as business outcomes;
   first-class policy editors (start with Return Approval: mode, rules,
   delegation, SLA — the reference capability already has the backend).
4. **R3 — Approvals**: approval queues, delegation management, SLA dashboards
   (pending > 24h / > 48h, average approval time) reading the SLA capability.
5. **R4 — Permissions / Role Builder**: business-language role editor on the
   permission catalog (separate design brief).
6. **R5 — Organization, Integrations, Audit**: fold existing surfaces into the
   console with consistent conventions.

Each step ships behind its own flag and preserves today's screens until the
console reaches parity.
