# Role Builder & Permission Studio — Future Platform Roadmap & Architecture Note

**Status:** Roadmap / architecture requirement only — **not started; document only. Do not implement now.** Recorded 2026-06-19. A **future platform capability**, to be designed on top of the governance model being introduced in **G6**.

## Objective
Let **Company Admins** and **Platform Owners** create, clone, configure, and maintain **custom roles** — including **field-level governance** — entirely from the UI, **without developer involvement**.

## Built on the governance model (G6)
The Role Builder consumes the **same** field-governance engine and access levels:
**Hidden · View · Request Change · Edit · Approve.**
- **Hidden / View / Request Change / Edit** are field-access levels already in the engine after G6 (`erp_field_access.access`, resolved by `resolveLayout`/`resolveAccess`).
- **Approve** is a **workflow capability** (who may approve change requests), composed alongside field access — not a field-edit level.

## Required capabilities (future)
1. **Create New Role**
2. **Clone Existing Role**
3. **Edit Existing Role**
4. **Compare Roles** (diff two role matrices)
5. **Export Role Matrix** (e.g. CSV/JSON of field × access per role)
6. **Import Role Matrix**
7. **Role Templates** (seed a role from a starting matrix)

### Example templates
Sales Representative · Van Sales · Collector · Merchandiser · Supervisor · Area Manager · Credit Manager · Warehouse Keeper · Accountant · Company Admin.

### Example field-level governance (UI-configurable)
| Field | Levels offered |
|-------|----------------|
| CR Number | View · Request Change · Edit |
| VAT Number | View · Request Change · Edit |
| Credit Limit | View · Request Change · Edit · Approve |
| Route | View · Request Change · Edit |

## Architecture requirement — G6 must not need refactoring later
The governance engine introduced in G6 is **already shaped for this**, and must stay that way:
- **Data-driven, per company × entity × field × subject × access** (`erp_field_access`, `subject_type ∈ {role, permission, capability}`), resolved by the pure `resolveLayout`/`resolveAccess` core. A Role Builder UI is "just another writer/reader" of these rows — no engine change required.
- **`request` is first-class** (G6), so the full Hidden/View/Request Change/Edit set is selectable per field/role today.
- **Admin-lockout protection** + **most-permissive resolution** are centralized in the engine, so any role-authoring UI inherits the same guards.
- **Subjects are abstract** (role/permission/capability) — custom roles slot in as new role subjects without schema change.

### Gaps to close when the Role Builder is scheduled (future, not now)
- **Role lifecycle UI** (create/clone/compare/import/export/templates) over the existing role + `erp_field_access` model.
- **Approve** capability wiring per field/role (compose with the change-request workflow from G7).
- **Role-matrix export/import** format (CSV/JSON) + validation.
- **Templates** as seedable matrices (the G6 default matrix is the first such template).

## Methodology (when scheduled)
Audit → architecture review → before/after → reuse analysis → implementation plan → approval → small validated commits — same gated cadence as the rest of this initiative. Constraints: reuse-first; no business-logic / RLS / workflow change unless separately approved.

## Disposition
**Parked** as a future platform capability. G6 deliberately keeps the governance model **UI-consumable and extensible** so this can be built **without architectural refactoring**. Nothing implemented until a dedicated, approved workstream.
