# VANTORA Staging — FMCG Org Structure, Permissions & Pilot Gap Analysis

Environment: `vantora-staging` · Company: Nile FMCG Distribution Group (SAR/SA) · 58 users · kako-fmcg untouched.

## 1. Organization chart
```
Company Admin (admin)
├─ General Manager (manager)
│   ├─ National Sales Manager
│   │   ├─ Sales Manager (regional) -> Area Managers (Central/Western/Southern)
│   │   │      -> Supervisors (Modern/Traditional Trade + 4 Field) -> 12 Van Reps . 6 Cash Vans
│   │   └─ Key Account Manager -> Modern Trade Supervisor
│   ├─ Trade Marketing Manager -> Merchandising Supervisor -> 10 Merchandisers
│   ├─ Procurement Manager -> Purchasing Officer
│   ├─ Warehouse Manager -> Inventory Controller
│   ├─ Finance Manager -> Accountant . AR . AP . Credit Controller -> Collection Officer
│   └─ Customer Service
└─ Data Admin
Platform Owner -- cross-tenant (vendor)
```

## 2. User count by role (58)
salesman 28 (12 van + 6 cash + 10 merch); supervisor 7; accountant 5; area_manager 4; warehouse_keeper 3;
cashier 2; manager 1; national_sales_manager 1; sales_director 1; regional_manager 1; branch_manager 1;
it_admin 1; viewer 1; admin 1; platform_owner 1.

## 3. Branch structure (5 regions / 13 branches)
Central: Riyadh (HQ), Al Kharj, Qassim. Western: Jeddah, Makkah, Madinah, Taif.
Southern: Abha, Khamis Mushait, Jazan, Najran. Eastern: Dammam. Northern: Tabuk.

## 4. Warehouse structure (23)
5 main DCs (Riyadh, Jeddah, Abha, Dammam, Tabuk) + 18 vans (12 van-sales + 6 cash-van), each van assigned to a rep with opening stock.

## 5. Route ownership (28, 100% owned)
12 van-sales routes (van + rep), 6 cash-van routes (van + rep), 10 merchandiser routes (rep, no van). 28/28 have rep_id.

## 6. Permission matrix by role (grant counts)
admin 82; manager 76; branch_manager 39; sales_director 23; supervisor 22; regional_manager 20;
accountant 17; national_sales_manager 17; salesman 17; warehouse_keeper 17; area_manager 13; cashier 12; it_admin 9; viewer 3.

## 7. Screens per role
admin/manager: all. nsm/sales_director/regional/area: Sell, Collections, Returns, Customers, Inventory, Reports.
supervisor: + Reconciliation. branch_manager: + Purchasing/Suppliers/Stock-Adjust. warehouse_keeper: Inventory/Stock-Adjust/Purchasing/Reconciliation.
accountant: Accounting/Collections/Suppliers/Reports. cashier: Sell/Collections/Customers. salesman: Field-Van-Sales/Sell/Collections/Customers/Inventory.
it_admin: User Admin. viewer: Inventory/Reports.

## 8. Missing FMCG roles/permissions discovered
- Merchandiser -> salesman: lacks assortment.manage / survey.manage / grade.manage.
- Credit Controller -> accountant: lacks credit.request.approve (only admin/manager).
- Collection Officer -> cashier: cashier can also sell (no collect-only role).
- Cash Van vs Van Sales: both salesman, no permission distinction (cash van should not extend credit).
- Trade Marketing / Key Account / Modern-Trade / Traditional-Trade: no channel-specific roles (functionally OK via job titles).
Validation: 120/120 role assertions passed; 58/58 logins verified.

## Gaps before a real FMCG pilot
1. Role granularity: add dedicated FMCG roles or per-company role permissions so each title gets exact rights.
2. Grant merchandising permissions (assortment/survey/grade) to merchandisers.
3. Cash-vs-credit van control (permission/flag so cash vans cannot sell on credit).
4. Activation + real master data: KAKO_VAN_SALES on + per-company toggle, readiness diagnostic, supervised dry-run.
5. App surface: point an app at vantora-staging (or use it as the kako-fmcg rebuild target) to exercise logins in the UI.
6. Production target: kako-fmcg still needs the schema rebuild (pending backup confirmation).
