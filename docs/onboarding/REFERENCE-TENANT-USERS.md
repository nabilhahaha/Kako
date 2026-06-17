# Reference Tenant — Users & Demo Login Sheet

All identities in the **Nile FMCG Distribution Group** reference tenant
(`supabase/pilot/reference-company.sql`), with roles, emails, branches, and how
to log in for testing.

> **Credentials reality:** the seed inserts users into `auth.users` with **email
> only — no passwords**. Choose one "Enable login" method below before testing.
> These are **demo accounts on a demo/staging project** — never use demo
> passwords on production.

---

## 1. User roster

`*` = default branch. The "Name" is the job title (the seed doesn't store a
separate display name).

| # | Name / Job title | Role (enforced) | Email | Branch(es) |
|---|---|---|---|---|
| — | Platform Owner | *(platform-owner flag, no branch role)* | owner@nile-group.test | cross-tenant |
| 1 | Chief Executive Officer | admin | ceo@nile-group.test | CAI*, ALX, GIZ |
| 2 | General Manager | manager | gm@nile-group.test | CAI |
| 3 | Finance Manager | accountant | finance.manager@nile-group.test | CAI |
| 4 | Accountant | accountant | accountant@nile-group.test | CAI |
| 5 | Procurement Manager | branch_manager | procurement.manager@nile-group.test | CAI |
| 6 | Buyer | warehouse_keeper | buyer@nile-group.test | CAI |
| 7 | Sales Manager | regional_manager | sales.manager@nile-group.test | CAI*, ALX |
| 8 | Field Supervisor | supervisor | supervisor@nile-group.test | CAI*, ALX |
| 9 | Salesman | salesman | salesman@nile-group.test | ALX |
| 10 | Van Sales Rep | salesman | van.rep@nile-group.test | CAI |
| 11 | Warehouse Manager | warehouse_keeper | warehouse.manager@nile-group.test | CAI |
| 12 | Warehouse Keeper | warehouse_keeper | warehouse.keeper@nile-group.test | CAI |
| 13 | Inventory Controller | warehouse_keeper | inventory.controller@nile-group.test | CAI |
| 14 | Merchandiser | salesman | merchandiser@nile-group.test | CAI |
| 15 | Customer Service Agent | cashier | cs.agent@nile-group.test | CAI |
| 16 | Read-Only Executive | viewer | readonly.exec@nile-group.test | CAI |

Full permission matrix (allowed/blocked per role):
[`../architecture/fmcg/REFERENCE-COMPANY.md` §3](../architecture/fmcg/REFERENCE-COMPANY.md#3-permission-matrix).

---

## 2. Enable login (pick one)

### Option A — Admin sets a password (works on hosted Supabase)
As a super admin: **Settings → Users** → for each demo user, set an initial
password. Best when you only need a few accounts.

### Option B — Password-reset / invite email
Each demo user runs the "forgot password" flow on their email to set a password.
Requires the demo inbox to receive mail.

### Option C — Uniform demo password via SQL (local / self-hosted demo only)
Sets one shared password for **all** reference users and confirms their email so
GoTrue lets them sign in. **Demo/staging only — never production.**

```sql
-- Uniform demo password for every reference-tenant user.
UPDATE auth.users
SET encrypted_password = crypt('Vantora#Demo1', gen_salt('bf')),
    email_confirmed_at  = COALESCE(email_confirmed_at, now()),
    aud                 = COALESCE(NULLIF(aud, ''),  'authenticated'),
    role                = COALESCE(NULLIF(role, ''), 'authenticated')
WHERE email LIKE '%@nile-group.test';
```

After this, every account below logs in with password **`Vantora#Demo1`**
(`pgcrypto`/bcrypt is GoTrue-compatible). Rotate or clear it before any non-demo
use.

---

## 3. Demo Login Sheet (testing)

Shared demo password (Option C): **`Vantora#Demo1`** · Login at `/login`.

| Test as… | Role | Email | Password | What to verify |
|---|---|---|---|---|
| **Platform Owner** | platform owner | owner@nile-group.test | `Vantora#Demo1` | Cross-tenant visibility; all permissions |
| **CEO** | admin | ceo@nile-group.test | `Vantora#Demo1` | Settings/Users, approve customers, accounting, multi-branch |
| **General Manager** | manager | gm@nile-group.test | `Vantora#Demo1` | Broad authority incl. field |
| **Finance Manager** | accountant | finance.manager@nile-group.test | `Vantora#Demo1` | Accounting + collect; **no Sell** |
| **Accountant** | accountant | accountant@nile-group.test | `Vantora#Demo1` | Accounting/reports; **no Sell** |
| **Procurement Manager** | branch_manager | procurement.manager@nile-group.test | `Vantora#Demo1` | Purchasing + suppliers + reconcile |
| **Buyer** | warehouse_keeper | buyer@nile-group.test | `Vantora#Demo1` | Purchasing + inventory; **no supplier master** |
| **Sales Manager** | regional_manager | sales.manager@nile-group.test | `Vantora#Demo1` | Sell/collect/returns/reports (CAI+ALX) |
| **Field Supervisor** | supervisor | supervisor@nile-group.test | `Vantora#Demo1` | **Reconciliation**, reports |
| **Salesman (Alex)** | salesman | salesman@nile-group.test | `Vantora#Demo1` | My Day → sell/collect/return (Alex van) |
| **Van Sales Rep (Cairo)** | salesman | van.rep@nile-group.test | `Vantora#Demo1` | My Day → full field loop (Cairo van) |
| **Warehouse Manager** | warehouse_keeper | warehouse.manager@nile-group.test | `Vantora#Demo1` | Inventory + reconcile; **no Sell** |
| **Warehouse Keeper** | warehouse_keeper | warehouse.keeper@nile-group.test | `Vantora#Demo1` | Inventory + reconcile |
| **Inventory Controller** | warehouse_keeper | inventory.controller@nile-group.test | `Vantora#Demo1` | Inventory + reconcile |
| **Merchandiser** | salesman | merchandiser@nile-group.test | `Vantora#Demo1` | Field access, customers |
| **Customer Service Agent** | cashier | cs.agent@nile-group.test | `Vantora#Demo1` | Sell, collect, manage customers |
| **Read-Only Executive** | viewer | readonly.exec@nile-group.test | `Vantora#Demo1` | Reports only; everything else hidden |

A printable/spreadsheet copy is in
[`templates/demo-login-sheet.csv`](./templates/demo-login-sheet.csv).

---

## 4. Suggested test path

1. **Van Sales Rep** → open day → visit → sell → collect → return → close.
2. **Field Supervisor / Warehouse Keeper** → run day-end **reconciliation**.
3. **Accountant** → confirm AR / accounting; **cannot** sell.
4. **Read-Only Executive** → confirm reports visible, transactional screens hidden.
5. **CEO** → approve a pending customer (CUST-015/016), manage users.

Re-assert the whole role matrix automatically with
`supabase/pilot/reference-activity-and-validate.sql` (109 assertions) —
see [`../architecture/fmcg/REGRESSION-VALIDATION-GUIDE.md`](../architecture/fmcg/REGRESSION-VALIDATION-GUIDE.md).

## 5. Security

- Demo accounts + demo password are for **demo/staging only**.
- For a real pilot, do **not** seed `auth.users`; invite real users via
  Settings → Users (see [`USER-ONBOARDING-GUIDE.md`](./USER-ONBOARDING-GUIDE.md))
  and let them set their own passwords.
- Clear demo logins on teardown: `DELETE FROM auth.users WHERE email LIKE '%@nile-group.test';`
