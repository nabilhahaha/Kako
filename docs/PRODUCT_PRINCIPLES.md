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
