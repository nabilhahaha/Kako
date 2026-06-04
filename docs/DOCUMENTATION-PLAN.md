# VANTORA — Full Platform Documentation Plan

> Item #2 of the review sequence. A **plan** for the complete documentation set —
> audiences, structure, what each doc contains, gaps, and delivery order. No docs
> are rewritten here; this is for approval before authoring.

Anchored on the standing principles: **Platform → Module → Customer-specific**
(`PRODUCT_PRINCIPLES.md`) and **full modularity + per-module/entity coexistence**.

---

## 1. Audiences & doc types

| Audience | Needs | Doc type |
|---|---|---|
| **End user** (sales rep, clinic reception, cashier…) | how to do a task in their module | Task/how-to guides per module |
| **Company admin** (tenant admin) | setup, users/roles, modules, custom fields, workflows, billing | Admin guides |
| **Platform owner / internal staff** | tenant mgmt, staff, plans, platform ops | `OWNER_GUIDE.md` (exists) + staff guide |
| **Integrator / developer** | API, webhooks, connectors, sync, entity framework | Integration & dev reference |
| **Ops / maintainer** | deploy, migrations, backups, staging, monitoring | `MAINTENANCE.md`/`STAGING.md`/`BACKUPS.md` (exist) |
| **Buyer / evaluator** | what modules exist, what each does, coexistence | Module catalog + coexistence playbook |

---

## 2. Existing docs inventory (keep / extend)

Already present in `docs/`:
- **Foundations:** `ARCHITECTURE.md`, `PRODUCT_PRINCIPLES.md`, `ROADMAP.md`,
  `CONVENTIONS.md`, `ENTITY-FRAMEWORK.md`.
- **Capabilities:** `INTEGRATION.md`, `INTEGRATION-ADAPTERS.md` (new),
  `CUSTOM-FIELDS.md`, `DESIGN-SYSTEM.md`, `MODULES.md`, `ETA.md`.
- **Ops:** `OWNER_GUIDE.md`, `MAINTENANCE.md`, `STAGING.md`, `BACKUPS.md`,
  `TESTING.md`, `E2E.md`.

**Gap themes:** a true **Module Catalog** (per-module reference), a **Coexistence
Playbook**, a consolidated **API/Integration reference** for external developers,
**per-module admin/user guides**, and a **licensing/entitlement** doc (feeds #4).

---

## 3. Target documentation structure

```
docs/
  README.md                      ← index / map of all docs (NEW)
  product/
    PRODUCT_PRINCIPLES.md        ✔ (move/link)
    MODULE-CATALOG.md            ← NEW: every module, one page each (see §4)
    COEXISTENCE-PLAYBOOK.md      ← NEW: SoR-per-module, ERP-alongside patterns (§5)
    LICENSING.md                 ← NEW (aligns with review #4)
  architecture/
    ARCHITECTURE.md ✔  ENTITY-FRAMEWORK.md ✔  CONVENTIONS.md ✔
  integration/
    INTEGRATION.md ✔  INTEGRATION-ADAPTERS.md ✔
    API-REFERENCE.md             ← NEW: inbound /api/v1, webhooks, sync for integrators
  modules/<module>.md            ← NEW: admin + user guide per module (§4 template)
  operations/
    OWNER_GUIDE.md ✔ MAINTENANCE.md ✔ STAGING.md ✔ BACKUPS.md ✔ TESTING.md ✔ E2E.md ✔
  design/ DESIGN-SYSTEM.md ✔
```
(Folder moves are optional/cosmetic; the **new docs** are the substance. We can
keep the flat layout and just add the new files if you prefer minimal churn.)

---

## 4. Module Catalog — the core new artifact

One page per module, **identical template**, reflecting modularity:

> **Module:** Sales · CRM · Field Operations · Approvals & Workflow · Analytics &
> Reporting · Trade Spend · Inventory & Warehousing · Procurement · Billing ·
> Finance · Integrations

Each page:
- **Purpose & who uses it.**
- **Entities owned** (registry keys) + **permissions** that gate it.
- **Entitlement:** plan-module + marketplace toggle (how to enable/disable).
- **Dependencies:** explicitly *"none required"* + graceful degradation notes
  (what it does if a sibling module is off).
- **System-of-record options:** can VANTORA own it / can it sync from an ERP /
  which entities sync which direction.
- **Coexistence notes:** default SoR (per the approved table) + how to flip it.
- **Key screens & task how-tos** (links to the per-module user guide).

This page set is what makes "adopt module-by-module" legible to buyers and admins.

---

## 5. Coexistence Playbook (new)

Practical recipes for VANTORA-alongside-ERP, keyed to the approved ownership map:
- **ERP owns** Finance / Inventory / Procurement → inbound sync recipes (master
  data + stock) with conflict policy guidance.
- **VANTORA owns** CRM / Sales / Field Ops / Trade Spend / Approvals / Analytics /
  Workflow → outbound sync recipes (orders, trade-spend settlements → ERP
  finance).
- **Per-entity SoR** worked examples (e.g. "VANTORA CRM + Field Ops, SAP Inventory
  + Finance"): which connection, which sync jobs, which direction/mode/conflict.
- **Decision checklist** for choosing SoR per module/entity.

---

## 6. API / Integration reference (new, integrator-facing)

Consolidated external-developer doc: inbound **`/api/v1/{entity}`** (auth via API
key, scopes, idempotency, rate limits, examples), **webhooks** (events, HMAC
verification, retry semantics), **connectors & sync** (how a customer's ERP
connects), and the **entity model** integrators target. Pulls scattered detail
from `INTEGRATION.md` into one place external teams can be handed.

---

## 7. Documentation maintenance (keep docs true)

- **PR rule (already standing):** record the Platform/Module/Customer
  classification in each feature PR; extend to "update the module-catalog page +
  API reference when a capability changes."
- **Status legend** in capability docs (✅ built · 🟡 placeholder · 🔜 planned) —
  already used in `INTEGRATION.md`; apply consistently so docs never over-claim.
- **Single index** (`docs/README.md`) so nothing is orphaned.

---

## 8. Delivery order (each a reviewable doc PR, after this plan is approved)

1. **`docs/README.md` index** + adopt the status legend everywhere (small).
2. **`MODULE-CATALOG.md`** (the 11 module pages, shared template) — highest value.
3. **`COEXISTENCE-PLAYBOOK.md`** (depends on the catalog + approved ownership map).
4. **`API-REFERENCE.md`** (integrator-facing; consolidates 2A/2B/2C).
5. **Per-module admin/user guides** (`modules/<module>.md`) — phased by module
   priority.
6. **`LICENSING.md`** — authored alongside review **#4** (module licensing &
   subscription architecture) so they stay consistent.

Each doc PR is small, reviewable, and committed to the working branch like the
existing docs.

---

## 9. Decisions to confirm (before authoring #2's docs)

1. **Layout:** keep the **flat `docs/` layout** (just add new files) or adopt the
   **foldered structure** in §3? *(Recommend flat + new files — minimal churn.)*
2. **Module-catalog scope first pass:** document **all 11 modules** at catalog
   level now, or only the **currently-built** ones first and stub the rest as
   🔜? *(Recommend: catalog all 11, mark built vs planned with the status
   legend — gives buyers the full modular picture without over-claiming.)*
3. **Authoring trigger:** author these docs **now** (as the next work), or **after
   reviews #3 + #4** so the legacy audit + licensing decisions are reflected?
   *(Recommend authoring the index + module catalog now; defer `LICENSING.md` to
   pair with #4.)*

*(Item #2 of 5. Paused here for your review before #3 — Legacy audit report:
Keep / Refactor / Archive / Delete.)*
