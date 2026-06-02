# VANTORA — Product Principles

> **VANTORA is a Platform, not a single-industry application.**
>
> Build once. Reuse everywhere. Sell many times.

This is the **official, standing decision rule** for every feature, customer
request, and roadmap item. It governs design across the codebase and the docs
(`ARCHITECTURE.md`, `ROADMAP.md`, `OWNER_GUIDE.md`, and all future planning).

---

## The classification rule

Evaluate every request in this order, and **prefer the leftmost** option it can
reasonably be:

### 1. Core Platform capability
Cross-cutting infrastructure that **every** tenant and module inherits
automatically. Built **once** at the framework level — never per module, never
per industry.
*Examples (built):* Entity Framework, Import/Export Engines, Mapping Templates,
Permissions & RLS, Audit, Platform Ownership & Staff, **Billing & Subscriptions**.

### 2. Reusable Module
A capability that several business types **opt into via configuration**. One
implementation, reused across industries — never forked per industry.
*Examples:* Promotions = **FMCG/Sales module**; Commission Engine = **Sales
module**; Appointments = **Scheduling module** (shared by clinic + salon +
services); Inventory = **Warehouse module**.

### 3. Customer-specific customization
The **last resort**. Even then, express it through platform primitives — custom
fields, dynamic forms, per-company configuration, company roles/permissions —
**never** a hardcoded branch for one customer or one industry.

**Preference:** `Core Platform → Reusable Module → Customer-Specific`.

---

## Hard rules

- **No per-customer or per-industry code forks.** If two industries need
  something similar, build one generic module/primitive they both configure.
- **Engines key on `entity`, not industry.** (Import/Export/API/Audit/Notes/…)
- **Modules are config, not code paths:** gated by plan ∩ business type via DB
  config (setup wizard / marketplace), not `if (businessType === …)`.
- **Promote, don't duplicate.** When a pattern appears in a second place (e.g.
  appointments in clinic, then salon), promote it to a shared module rather than
  copying it.
- **Flag the anti-pattern.** When a request looks customer/industry-specific, the
  response must propose the Platform/Module way to achieve it.

## Why
One shared platform + reusable modules means each capability is **built once,
reused everywhere, and sold many times** — instead of fragmenting VANTORA into
separate applications that each must be maintained and can't cross-sell.

## How to apply it (checklist for any new request)
1. Is this **Core Platform**? If yes, build it at the framework level for all.
2. If not, is it a **Reusable Module** several business types could use? Build it
   generic + config-gated.
3. Only if neither: a **Customer-specific** need → implement via custom
   fields / dynamic forms / per-company config — no hardcoding.
4. Record the classification in the feature's plan/PR.

---

## Standing principle: Modularity & coexistence

> **VANTORA is fully modular.** A customer can adopt any module independently or
> in any combination, and grow into the full platform over time.

Modules (each usable on its own or together): **Sales, CRM, Field Operations,
Approvals & Workflow, Analytics & Reporting, Trade Spend, Inventory &
Warehousing, Procurement, Billing, Finance, Integrations.**

The integration architecture **must support both deployment shapes, per module:**

1. **VANTORA as system of record** for a module (e.g. Inventory, Sales, CRM,
   Workflow, Billing) — VANTORA owns the data; external systems read/subscribe.
2. **VANTORA alongside an external ERP** (SAP, Oracle, Odoo, Dynamics, …) where
   **only selected modules/entities are synchronized** — the external system is
   the source of record for those, VANTORA for the rest.

The role (system-of-record vs synchronized) is decided **per module/entity**, not
globally — a customer can let VANTORA own CRM + Field Ops while syncing Inventory
and Finance from SAP. Goal: **gradual, module-by-module adoption** with no
all-or-nothing migration.

### How this is enforced (must stay true)
- **Module entitlement is config, not code:** licensing = plan-based module
  entitlements (`erp_plans` / plan-modules) ∩ per-company enablement (setup
  wizard / marketplace, `erp_company_modules`). A module runs only if entitled +
  enabled; disabling one never breaks another.
- **No hard dependencies between modules.** A module degrades gracefully when a
  sibling is off (feature-detect, don't assume). Shared needs go to Core Platform
  primitives both depend on — never a direct module→module coupling.
- **Integration is entity/module-scoped.** Connections + sync jobs choose *which*
  entities sync and in which direction (see `INTEGRATION.md`), so external-ERP
  coexistence is selective by design.
- **Reflect this in:** the connector/adapter roadmap (selective sync, per-entity
  source-of-record), licensing architecture (per-module entitlement), the
  documentation plan (module + coexistence docs), and every future module's
  design (independently usable, config-gated, no cross-module hardcoding).
