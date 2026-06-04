# VANTORA — Module Ownership & Coexistence Matrix

How **system-of-record (SoR)** is assigned when VANTORA runs **standalone** vs
**alongside an external ERP** (SAP / Oracle / Dynamics / Odoo). Ownership is
**configurable per module and per entity** — never global — and enforced by the
sync engine's per-entity jobs (`erp_sync_jobs`: entity + direction + mode +
conflict policy). See [`SYNC-ENGINE.md`](SYNC-ENGINE.md).

## Default ownership map (approved)

| Module | Standalone SoR | Coexistence default SoR | Typical sync direction (into VANTORA) |
|---|---|---|---|
| **Finance** | VANTORA | **External ERP** | none / read-only mirror |
| **Inventory & Warehousing** | VANTORA | **External ERP** | **in** (items, stock) |
| **Procurement** | VANTORA | **External ERP** | **in** / **both** |
| **Sales** | VANTORA | Either (config) | **out** (VANTORA orders/invoices → ERP) |
| **CRM** | VANTORA | **VANTORA** | — (customers may sync **in**) |
| **Field Operations** | VANTORA | **VANTORA** | — |
| **Trade Spend** | VANTORA | **VANTORA** | **out** (settlements → ERP finance) |
| **Approvals & Workflow** | VANTORA | **VANTORA** | — |
| **Analytics & Reporting** | VANTORA | **VANTORA** | — (BI export **out**) |
| **Billing** | VANTORA | **VANTORA** | — (SaaS billing) |
| **Integrations** | VANTORA | **VANTORA** | — (the bridge itself) |

This map is the **default**, not a constraint: any cell is overridable per
deployment, and at the **entity** level within a module.

## Worked example — "VANTORA front office + SAP back office"
- VANTORA owns **CRM, Field Ops, Sales execution, Trade Spend, Approvals,
  Analytics**.
- SAP owns **Finance, Inventory, Procurement**.
- Sync jobs:
  - `customer` ← in (SAP business partners), `product` ← in (materials),
    inventory levels ← in.
  - `order`/`invoice` → out (VANTORA-created → SAP), trade-spend settlements →
    out to SAP finance.
- Conflict policy per entity: master data from SAP = `source_wins`;
  VANTORA-originated transactions = VANTORA is SoR (push only).

## Deciding SoR per module/entity (checklist)
1. **Who creates the record first?** That system is usually SoR.
2. **Who must it be authoritative for compliance/finance?** (often the ERP).
3. **Direction:** SoR elsewhere → sync **in**; VANTORA-originated → sync **out**.
4. **Mode:** initial **full** load, then **delta** by modified-since cursor.
5. **Conflict policy:** `source_wins` (overwrite) / `vantora_wins` (insert-only) /
   `manual_review` (queue conflicts).
6. **Entitlement:** the module must be entitled + enabled for the company
   ([`LICENSING.md`](LICENSING.md)); disabling a module never breaks another.

## Partial adoption
Because ownership is per-module, customers can adopt **Sales only**, **Inventory
only**, **Workflow only**, **Analytics only**, etc., and expand later — with the
ERP retaining SoR for everything not yet adopted. No all-or-nothing migration.
