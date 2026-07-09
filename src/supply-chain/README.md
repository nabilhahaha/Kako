# Supply Chain Validation

Internal operational platform that validates outbound shipments to distributors:

```
PI  →  Delivery Note(s)  →  Invoice(s)
```

Every Delivery Note and Invoice links back to its originating PI, which is
tracked through five statuses: **Open → Partially Delivered → Waiting Invoice →
Completed / Completed with Exception**.

Phase 1 is **manual-first**: operators create PIs, Delivery Notes and Invoices
through ERP-style entry forms. File import / column mapping is intentionally
deferred to a future phase — the architecture supports it without a rewrite.

## Architecture (clean, layered)

```
domain/        Models, enums, configurable rules — pure data, no dependencies
validation/    Validation Engine + independent rules (open/closed)
repositories/  DataStore interfaces + IndexedDB implementation (swappable)
services/      Business logic: entry, validation, exceptions, PI aggregation,
               search, audit, config, session
hooks/         react-query bindings (queries + mutations)
components/    Reusable UI (badges, forms, dialogs, shell, primitives)
pages/         Route screens
utils/         Dates, formatting, ids, files
```

Rules of the codebase:

- **Validation rules never live in UI.** They are pure functions in
  `validation/rules/*` returning findings from a read-only context.
- **Adding a rule** = create a file in `validation/rules/` and register it in
  `validation/rules/index.ts`. Nothing else changes.
- **Business thresholds are configurable** (`domain/config.ts`, editable in
  Settings): minimum shelf life, max quantity difference, invoice tolerance.
- **Persistence is abstracted.** Services depend on `repositories/types.ts`
  only; the IndexedDB engine can be replaced with a REST/Supabase DataStore by
  changing one line in `repositories/index.ts`.
- **Everything is audited** via `services/auditService.ts`; exceptions are
  permanent and never deleted.

## Validation rules (Phase 1)

| Code | Rule |
|------|------|
| `DN_BELONGS_TO_PI` | Every Delivery Note must belong to an existing PI |
| `QTY_NOT_EXCEED_PI` | Σ delivered per SKU must not exceed PI quantity |
| `SKU_EXISTS_IN_PI` | A delivered SKU must exist on the PI |
| `SHELF_LIFE_MIN` | Remaining shelf life ≥ configured minimum (default 70%) |
| `INVOICE_DUPLICATE` | Invoice numbers must be unique |
| `DELIVERY_WITHOUT_INVOICE` | Delivery not yet invoiced |
| `INVOICE_WITHOUT_DELIVERY` | Invoice with no backing delivery |
| `INVOICE_QTY_MISMATCH` | Invoiced vs delivered quantity differs |
| `MISSING_INVOICE` | Fully delivered PI with no invoice |

Validation runs automatically after every create / edit / delete and after
exception decisions.

## Colour standard

Green = Passed · Yellow = Warning · Orange = Exception · Red = Failed.

## Route

Mounted at `/supply-chain` (see `SupplyChainApp.tsx`).

## Future modules (architecture-ready, not built)

File import & smart column mapping, dashboards / KPIs / analytics, Power BI,
notifications, workflow approval, AI assistant, ERP (Oracle / SAP) integration.
