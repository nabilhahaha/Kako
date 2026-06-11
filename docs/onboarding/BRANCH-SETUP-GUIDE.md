# Branch Setup Guide

Branches are the operational + numbering scope of the distributor (each branch
owns its document sequences and its warehouses, customers, and users).

## 1. Plan the branch structure

| Decide | Guidance |
|---|---|
| How many branches | One per physical depot / distribution center. Start with the pilot branch only; add others later. |
| Branch **code** | Short, stable, UPPERCASE (e.g. `CAI`, `ALX`). Appears in every document number (`INV-CAI-000001`). **Do not change it after go-live.** |
| HQ branch | Mark the head office branch as HQ. |

> Branch codes only need to be unique **within this company**. Since migration
> 0268 made document numbering tenant-scoped, reusing common codes (`CAI`, `ALX`)
> that other tenants also use is safe.

## 2. Create branches

**Option A — Import (recommended for 2+ branches):** Settings → Import → Branch →
upload `templates/01-branches.csv`.

```
code,name,name_ar,city,phone,external_id
CAI,Cairo HQ,القاهرة - الرئيسي,Cairo,+20-2-3500-0000,BR-CAI
```

**Option B — UI:** Settings → Branches → New (requires `settings.branches`).

Required: `code`, `name`. Recommended: `name_ar`, `city`, `phone`.

## 3. Add warehouses per branch

Every branch needs at least one **main (fixed) warehouse** for receiving stock,
plus a **van warehouse** per rep. Import `templates/02-warehouses.csv` (see the
[Van Setup Guide](./VAN-SETUP-GUIDE.md) for vans):

```
branch_ref,code,name,name_ar,location,is_van
CAI,WH-CAI,Cairo Main Warehouse,مخزن القاهرة الرئيسي,Smart Village,false
```

`branch_ref` resolves to the branch **code**.

## 4. (Optional) Regions / areas / departments

- **Regions / areas** — geographic grouping for customers/routes (Settings →
  Import → Region/Area, or UI). Useful for multi-branch reporting.
- **Departments / job titles** — organizational structure for users (see the
  [User Onboarding Guide](./USER-ONBOARDING-GUIDE.md)). Optional; they don't grant
  permissions.

## 5. Verify

- [ ] Each branch has a unique code and at least one main warehouse.
- [ ] The pilot branch is set; HQ flagged.
- [ ] Compare against the reference tenant (3 branches: CAI/ALX/GIZ) if helpful.

Next: [Van Setup Guide](./VAN-SETUP-GUIDE.md).
