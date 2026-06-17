# Return Workflow Enhancement — Design & Preparation (Next Phase)

**Status:** DESIGN ONLY — not implemented. Prepared per request to design/prepare the workflow without interrupting in-flight work.
**Scope:** split the single van Return action into **Saleable** vs **Damage** returns, route damage stock to a dedicated quarantine warehouse, and separate the two everywhere in reporting.

---

## 1. Locked decisions (from product)

- **Damage destination:** a **dedicated Damage / Quarantine warehouse**. Saleable and damaged inventory **must never be mixed**.
  - Saleable Return → back to **sellable** stock → available for resale.
  - Damage Return → **Damage / Quarantine** inventory → not sellable → awaits warehouse review/disposal.
- **No immediate write-off.** Damaged stock retains a tracked balance until a disposal decision.
- **Pilot scope:** a **single company-level Damage Warehouse** is sufficient. Per-branch Damage Warehouses are a later enhancement.
- **Disposition is extensible.** Future states beyond "in quarantine": **Destroyed, Supplier Claim, Return to Supplier, Expired** (handled by a later disposition workflow, out of scope here but the schema leaves room).

## 2. Return types & reasons

| Return type | Code | Stock effect |
| --- | --- | --- |
| Saleable Return (مرتجع صالح) | `saleable` | `return_in` into the salesman's van warehouse (current behavior) |
| Damage Return (مرتجع تالف) | `damage` | `return_in` into the company **Damage/Quarantine** warehouse |

**Damage reason (required for Damage returns only):** Expired · Broken · Melted · Transport Damage · Packaging Damage · Other (note required for "Other").

> Note: the existing `erp_return_reasons` table already seeds a `damaged` label; the new damage-reason set is a distinct, damage-specific taxonomy. Recommendation: introduce a `kind` on `erp_return_reasons` (`general` | `damage`) and seed the six damage reasons as `kind='damage'`, so the reason picker filters by return type without a parallel table.

## 3. UX flow (visit-oriented)

```
Return tile (cockpit)
  ↓
Select Return Type
  • Saleable Return
  • Damage Return → Select Damage Reason (Expired / Broken / Melted /
                     Transport Damage / Packaging Damage / Other[+note])
  ↓
Select Items (existing returnable-lines step)
  ↓
Confirm Return
  ↓
Create Return Transaction (credit note as today)
  ↓
SUCCESS (transaction-agnostic, same pattern just shipped):
  • Primary:   العميل التالي
  • Secondary: إجراء آخر لنفس العميل  → customer cockpit
  • (no "مرتجع جديد")
```

The success screen already follows this pattern after commit `00fcb6f`; the enhancement only adds the type/reason steps before item selection.

## 4. Data model changes

### 4.1 Warehouse — damage kind
- Add `erp_warehouses.is_damage boolean not null default false` (or a `kind` enum `main|van|damage`).
- **Provision** one company-level damage warehouse per company (idempotent seed): `is_damage = true`, not `is_van`, not a sell source. Resolver helper `erp_company_damage_warehouse(company_id)`.

### 4.2 Returns — type + damage reason
- `erp_sales_returns.return_type text not null default 'saleable'` (`check in ('saleable','damage')`). Default keeps **all existing returns = saleable** (backward compatible).
- `erp_sales_returns.damage_reason text null` (one of the six codes; required when `return_type='damage'`).
- Optional `erp_sales_returns.disposition text` reserved for the future states (`in_quarantine|destroyed|supplier_claim|returned_to_supplier`), default `in_quarantine` for damage.

### 4.3 Stock movement
- Saleable: unchanged — `return_in` into `v_wh` (van).
- Damage: `return_in` into the resolved company **damage warehouse** (NOT the van). Optionally tag movement notes/`reference` with the damage reason for traceability.

## 5. RPC changes — `erp_van_return`

Extend the signature (new optional params, backward compatible — old callers default to saleable):

```
erp_van_return(
  p_branch_id, p_customer_id, p_lines, p_reason_id,
  p_invoice_id default null, p_create_credit_note default false,
  p_notes default null, p_idempotency_key default null,
  p_return_type text default 'saleable',      -- NEW
  p_damage_reason text default null            -- NEW (required when damage)
)
```

Behavior:
- Validate: `p_return_type in ('saleable','damage')`; when `damage`, `p_damage_reason` is required and must be a valid damage reason code.
- Resolve destination warehouse: `saleable → v_wh`; `damage → erp_company_damage_warehouse(v_company)` (raise if not provisioned).
- Post `return_in` to the resolved warehouse; persist `return_type` + `damage_reason` on the header.
- Credit note / customer credit is issued **identically** for both types (the customer is made whole regardless of saleability).
- Keep `SECURITY DEFINER`, the always-on `field.sales` guard (G1), idempotency, and audit.
- **New guarded RPC entry** stays in the `0314` guarded set (mirrors current `field.sales`).

## 6. Reporting & visibility

Separate **Saleable** vs **Damage** everywhere:
- **Returns analysis / return reports:** split totals; add **Damage Value**, **Damage by Reason**, **Damage by Salesman**, **Damage by Customer**, **Damage by SKU**.
- **Customer history / timeline:** show return type (and damage reason) per return.
- **Supervisor reports & Visit Outcomes:** surface return type; damage returns flagged.
- **Dashboards:** a Damage KPI (value + count) distinct from saleable returns.
- Source of truth: `erp_sales_returns.return_type` + `damage_reason` joined to lines for value/SKU breakdowns.

## 7. i18n (ar/en) to add

- `vanSales.return.type` block: `saleable` (مرتجع صالح) · `damage` (مرتجع تالف) · `selectType`.
- `vanSales.return.damageReason` block: `expired` (منتهي) · `broken` (مكسور) · `melted` (ذائب) · `transport` (تلف نقل) · `packaging` (تلف تغليف) · `other` (أخرى).
- Report labels: damage value / by reason / by salesman / by customer / by SKU.

## 8. Rollout, flag & compatibility

- Gate behind a new platform flag `platform.return_types` (default OFF) so the pilot ships dark, consistent with the other FMCG flags. When OFF, the single Return action behaves exactly as today (saleable).
- Migrations are additive (new columns default-saleable, new nullable damage fields) → **no backfill risk**; existing returns read as saleable.
- Rollback: drop the new columns + function overload; the damage warehouse seed is inert if unused.

## 9. Phased implementation plan (next phase)

| Phase | Deliverable |
| --- | --- |
| A — Schema & provisioning | `is_damage` warehouse flag + company damage-warehouse seed + resolver; `return_type`/`damage_reason`/`disposition` columns; `erp_return_reasons.kind`; damage-reason seed. |
| B — RPC | `erp_van_return` overload (type + damage reason + destination routing); guarded-RPC entry; unit/integration tests (saleable→van, damage→quarantine, validation, idempotency). |
| C — UI | Return-type step + damage-reason step before item selection; pure helpers (`RETURN_TYPES`, `DAMAGE_REASONS`, `damageReasonNeedsNote`) + tests; reuse the visit-oriented success screen. |
| D — Reporting | Saleable/Damage split in return reports; Damage Value + by Reason/Salesman/Customer/SKU; return type in customer history, supervisor reports, dashboards. |
| E — Future dispositions (later) | Quarantine review workflow: Destroyed / Supplier Claim / Return to Supplier / Expired transitions on `disposition`. |

## 10. Testing plan (next phase)

- Pure: return-type/damage-reason validation; note-required-only-for-other.
- RPC/integration: saleable restocks van; damage restocks the company damage warehouse and never the van; missing damage warehouse raises; damage reason required; credit note issued for both; idempotency.
- Invariants: van sellable balance unaffected by damage returns; damage warehouse balance increments by returned qty; reporting totals reconcile (saleable + damage = all returns).

---

*Prepared as design-only. No schema, RPC, or UI changes were made for this enhancement. Implementation awaits go-ahead for the next phase.*
