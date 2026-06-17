# VANTORA Staging — FMCG 50+ Employee Demo (Login Sheet & Access Map)

**Environment:** `vantora-staging` (Supabase `rsjvgehvastmawzwnqcs`) — full repo schema applied.
**Company:** Nile FMCG Distribution Group (SAR · SA · business type `fmcg`).
**Shared demo password (all users):** `Vantora#Demo1`
**`kako-fmcg`:** untouched.

> Built to prove the FMCG pilot user structure end-to-end before touching kako-fmcg.

## Results

| Check | Result |
|---|---|
| Demo users created | **58** (1 platform owner + 57 company users) |
| Logins confirmed (email confirmed + bcrypt verifies) | ✅ **58 / 58** |
| Regions / branches | **5 / 13** |
| Multi-branch warehouses (DCs) | **5** (Riyadh, Jeddah, Abha, Dammam, Tabuk) |
| Vans (assigned to reps) | **18** (12 van-sales + 6 cash-van) |
| Owned routes (reps + merchandisers) | **28** |
| **Role-based access assertions** | ✅ **120 / 120 passed, 0 failed** |

## Organization & reporting lines

```
Company Admin (admin)
├─ General Manager (manager)
│   ├─ National Sales Manager
│   │   ├─ Sales Manager (regional) ──> Area Managers (Central/Western/Southern)
│   │   │      └─ Supervisors (Modern Trade / Traditional Trade / 4 Field) ──> Van Reps · Cash Vans
│   │   └─ Key Account Manager ──> Modern Trade Supervisor
│   ├─ Trade Marketing Manager ──> Merchandising Supervisor ──> Merchandisers
│   ├─ Procurement Manager ──> Purchasing Officer
│   ├─ Warehouse Manager ──> Inventory Controller
│   ├─ Finance Manager ──> Accountant · AR Accountant · AP Accountant · Credit Controller ──> Collection Officer
│   └─ Customer Service
└─ Data Admin

Platform Owner — cross-tenant (vendor), not a company role.
```

**Regions → branches:** Central (Riyadh*, Al Kharj, Qassim) · Western (Jeddah, Makkah, Madinah, Taif) ·
Southern (Abha, Khamis Mushait, Jazan, Najran) · Eastern (Dammam) · Northern (Tabuk). `*`=HQ.

## Access map (which screens each role can reach)

| Role (enforced) | Accessible screens |
|---|---|
| platform_owner | **Everything, every tenant** |
| admin / manager | Field/Van Sales, Sell, Collections, Returns, Customers, Approve Customers, Inventory, Stock Adjust, Purchasing, Suppliers, Reconciliation, Accounting, Reports, User Admin |
| national_sales_manager / sales_director / regional_manager / area_manager | Sell, Collections, Returns, Customers, Inventory, Reports |
| supervisor | Sell, Collections, Returns, Customers, Inventory, **Reconciliation**, Reports |
| branch_manager (Procurement) | Sell, Collections, Returns, Customers, Inventory, Stock Adjust, **Purchasing, Suppliers**, Reconciliation, Reports |
| warehouse_keeper | Inventory, Stock Adjust, Purchasing, Reconciliation |
| accountant | **Accounting**, Collections, Suppliers, Reports |
| cashier | Sell, Collections, Customers |
| salesman (Van/Cash/Merch) | **Field/Van Sales**, Sell, Collections, Customers, Inventory |
| it_admin (Data Admin) | **User Admin** (settings/imports) |
| viewer (Auditor) | Inventory, Reports (read-only) |

## Login sheet (password = `Vantora#Demo1` for all)

### Leadership & specialists (named)
| Email | Role | Job title | Branch · Region |
|---|---|---|---|
| owner@nile-group.test | platform_owner | Platform Owner | cross-tenant |
| admin@nile-group.test | admin | Company Admin | RYD · Central |
| gm@nile-group.test | manager | General Manager | RYD · Central |
| national.sales@nile-group.test | national_sales_manager | National Sales Manager | RYD · Central |
| trade.marketing@nile-group.test | sales_director | Trade Marketing Manager | RYD · Central |
| sales.manager@nile-group.test | regional_manager | Sales Manager | RYD (+JED/ABH) |
| key.account@nile-group.test | area_manager | Key Account Manager | RYD · Central |
| area.central@nile-group.test | area_manager | Area Manager | RYD (+KHJ/QSM) |
| area.western@nile-group.test | area_manager | Area Manager | JED (+MAK) · Western |
| area.southern@nile-group.test | area_manager | Area Manager | ABH (+KHM) · Southern |
| modern.trade.sup@nile-group.test | supervisor | Modern Trade Supervisor | RYD · Central |
| traditional.trade.sup@nile-group.test | supervisor | Traditional Trade Supervisor | RYD · Central |
| merch.supervisor@nile-group.test | supervisor | Merchandising Supervisor | RYD · Central |
| procurement.manager@nile-group.test | branch_manager | Procurement Manager | RYD · Central |
| purchasing.officer@nile-group.test | warehouse_keeper | Purchasing Officer | RYD · Central |
| warehouse.manager@nile-group.test | warehouse_keeper | Warehouse Manager | RYD · Central |
| inventory.controller@nile-group.test | warehouse_keeper | Inventory Controller | RYD · Central |
| finance.manager@nile-group.test | accountant | Finance Manager | RYD · Central |
| accountant@nile-group.test | accountant | Accountant | RYD · Central |
| ar.accountant@nile-group.test | accountant | Accounts Receivable Accountant | RYD · Central |
| ap.accountant@nile-group.test | accountant | Accounts Payable Accountant | RYD · Central |
| credit.controller@nile-group.test | accountant | Credit Controller | RYD · Central |
| collection.officer@nile-group.test | cashier | Collection Officer | RYD · Central |
| cs.agent@nile-group.test | cashier | Customer Service | RYD · Central |
| data.admin@nile-group.test | it_admin | Data Admin | RYD · Central |
| auditor@nile-group.test | viewer | Read-only Auditor | RYD · Central |

### Field force (bulk; same password)
| Pattern | Count | Role | Job title | Branches (round-robin) |
|---|---|---|---|---|
| supervisor.field01–04@nile-group.test | 4 | supervisor | Field Sales Supervisor | ABH, DMM, JED, KHJ |
| van.rep01–12@nile-group.test | 12 | salesman | Van Sales Representative | ABH/DMM/JED/KHJ/MAK/RYD (each with a van + owned route) |
| cash.van01–06@nile-group.test | 6 | salesman | Cash Van Representative | ABH/DMM/JED/KHJ/MAK/RYD (van + owned route) |
| merch01–10@nile-group.test | 10 | salesman | Merchandiser | ABH/DMM/JED/KHJ/MAK/RYD (owned route, no van) |

A flat CSV of all 58 logins is in `templates/staging-fmcg-50plus-logins.csv`.

## Notes
- Logins are **verified at the auth layer** (email confirmed + bcrypt-verified password). `vantora-staging`
  has no app deployment pointed at it yet; point an app at this project (or use it as the kako-fmcg rebuild target) to use the logins in the UI.
- Every van/cash rep owns a **route + assigned van** (with opening stock); merchandisers own a **route**.
- This proves the pilot user structure end-to-end. **kako-fmcg remains untouched** pending your backup confirmation.
