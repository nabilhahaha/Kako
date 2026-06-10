# User Onboarding Guide

How to provision the distributor's users, assign the right roles and branches,
and get them logged in — fast and correctly.

## 1. Decide the role per person

VANTORA authority is **role-based** (the role grants permissions; departments /
job titles are organizational only). Map each person to the closest enforced
role — the certified reference tenant's mapping is the template:

| Person (title) | Enforced role | Key authority |
|---|---|---|
| CEO / Owner | `admin` | everything |
| General Manager | `manager` | nearly everything |
| Finance Manager / Accountant | `accountant` | accounting post/view, suppliers, collect (no selling) |
| Procurement Manager | `branch_manager` | purchasing + suppliers + inventory + reconcile |
| Buyer | `warehouse_keeper` | purchasing + inventory + reconcile (no supplier master) |
| Sales Manager | `regional_manager` | sell, collect, returns, reports |
| Field Supervisor | `supervisor` | sell, **reconcile-manage**, reports |
| Salesman / Van Sales Rep | `salesman` | **field sell/collect**, day close, reconcile-view |
| Warehouse Manager / Keeper / Inventory Controller | `warehouse_keeper` | inventory + **reconcile-manage** |
| Merchandiser | `salesman` | field access |
| Customer Service Agent | `cashier` | sell, collect, manage customers |
| Read-Only Executive | `viewer` | reports + view only |

> **Reconciliation must be run by a supervisor / warehouse-keeper, never the
> rep** (the rep is view-only by design). The full permission matrix is in
> [`../architecture/fmcg/REFERENCE-COMPANY.md` §3](../architecture/fmcg/REFERENCE-COMPANY.md#3-permission-matrix).

## 2. Create the users

### Option A — Bulk import (fastest for the team)
Settings → Import → **User** (requires `user.import`) → upload
`templates/07-users.csv`:

```
full_name,email,phone,role,branch_ref,reports_to,active
Van Sales Rep,van.rep@distributor.example,+20-10-1000-0005,salesman,CAI,supervisor@distributor.example,true
```

- `branch_ref` → branch **code**; `reports_to` → a manager's **email** (used for
  the supervisor hierarchy, e.g. rep → supervisor).
- Import provisions the user record + role + branch assignment, **but not a
  password** (see §4).
- Use **upsert** to re-run safely (dedupes on email).

### Option B — Individual create (UI)
Settings → **Users** → New (requires super admin): enter `full_name`, `email`,
`password` (min 6 chars), then **assign branch + role** (and `reports_to` for
salesman/cashier). Toggle `is_active` / `is_super_admin` as needed.

## 3. Multi-branch & oversight

A user can belong to **multiple branches** (e.g. a Sales Manager or Supervisor
overseeing CAI + ALX). Add one assignment per branch; mark one as the default.
The reference tenant does this for the CEO (all branches) and Sales
Manager/Supervisor (CAI + ALX).

## 4. Passwords & first login

Bulk-imported users have no password. Choose one:
- **Password reset / invite** — each user uses the "forgot password" flow on
  their email to set a password, or
- **Admin-set** — a super admin sets an initial password in Settings → Users.

Then the user logs in and lands on their role-appropriate home (`/today`).

## 5. Verify visibility (screens follow permissions)

Nav and pages are gated by the same permissions the RPCs enforce, so a correct
role automatically yields correct **accessible vs hidden** screens. Spot-check:
- [ ] Rep sees My Day / Sell / Collect / Return; **not** reconciliation-manage,
      purchasing, accounting, or settings.
- [ ] Supervisor/warehouse-keeper sees **Reconciliation**.
- [ ] Accountant sees Accounting/Reports; **not** Sell.
- [ ] Read-Only Executive sees Reports only.

To re-assert the whole matrix on staging, run
`supabase/pilot/reference-activity-and-validate.sql` (109 role assertions) — see
[`../architecture/fmcg/REGRESSION-VALIDATION-GUIDE.md`](../architecture/fmcg/REGRESSION-VALIDATION-GUIDE.md).

Next: [Branch Setup Guide](./BRANCH-SETUP-GUIDE.md) · [Van Setup Guide](./VAN-SETUP-GUIDE.md).
