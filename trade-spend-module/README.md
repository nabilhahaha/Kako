# Trade Spend — Native Dashboard Module

Converts the standalone **Roshen × Relia Trade Spend** app into a native **mode**
inside the **Roshen KSA Sales Dashboard** (`public/roshen_dashboard.html`), on the
shared "Roshen" Supabase project (`wrkugzssuoxneftzappa`).

> **Parallel run.** The legacy `public/trade_spend.html` stays **completely
> untouched** as the fallback / reference implementation. It is not modified,
> renamed, disabled, or deleted. The new module is built **beside** it and must
> produce **identical** business results before anything is retired.

> **No production changes.** All work is on branch `claude/trade-spend-native-module`.
> Nothing is deployed. The DB migrations in `migrations/` are **authored but not
> applied** — they run only after explicit approval.

## Layout
```
trade-spend-module/
  migrations/   # Roshen-project SQL — AUTHORED, NOT APPLIED
    001_dash_sku_master_taxonomy.sql        # + brand/category/sub_category/segment (nullable)
    002_ts_permissions.sql                  # ts.* namespace in dash RBAC
    003_sku_category_autopopulate.sql       # 6 unambiguous single-category items
    004_sku_category_conflicts_RESOLUTION_TEMPLATE.sql  # 14 conflicts, await approval
  reports/
    SKU_Category_Conflict_Report.docx       # deliverable #8
    sku_category_mapping.csv                # raw item→category mapping (editable)
  src/          # module source partials (built in later milestones)
```

## Data strategy — Dashboard is the single source of truth
| Entity | Read from | Notes |
|---|---|---|
| Sales | `sales_fact` (or the Dashboard's already-loaded dataset) | No more Excel upload / embedded blob / IndexedDB **inside the module** |
| Customers | `dash_customer_map` | join on `customer_code` = `acct` |
| Products + Category | `dash_sku_master` | category becomes read-only master (see migrations 001/003/004) |
| Users | `dash_users` | one login (Dashboard auth) |
| Permissions | `dash_roles` + `dash_users.overrides.ts` | `ts.*` namespace |
| **Trade-spend activities** | `activities` (owned by the module) | unchanged; only module writer |

Attribution path: `sales_fact.item_code → dash_sku_master.sku → category`.

## Auth — `ts.*` on Dashboard RBAC (replaces hardcoded emails)
`ts.view · ts.create · ts.edit · ts.delete · ts.approve.roshen · ts.approve.relia ·
ts.approve.final · ts.export · ts.admin`

Person-specific approval rights are granted via a **namespaced** override so
parallel-run results match the legacy exact-email gating:
```json
dash_users.overrides = { "ts": { "grant": ["ts.approve.roshen"], "revoke": [] } }
```
- Ahmed Nabil → `ts.approve.roshen`
- Muhammad Zubair → `ts.approve.relia`
- Dmytro → `ts.approve.final` (read-only: revokes create/edit/delete)

## Implementation style
- Everything under a single `window.TS` namespace — **no** new Dashboard globals.
- Integrate as: a `mode-btn[data-mode="tradespend"]`, a `#view-tradespend` view,
  a `switchMode()` branch, and `TS.*` render/data/calc/auth/export sub-modules.
- Reuse the Dashboard shell, tokens (`--bi-*` / `--ent-*`), components
  (`.kpi-card`, `.card`, `.btn`), Chart.js registry, and the shared Supabase
  client (`CLOUD.sb`). **The Dashboard is not redesigned.**

## Business logic (reused as-is)
Approval workflow (Roshen / Relia / Final), split %, ROI, uplift, verdict,
activity CRUD, photos, PDF (jsPDF), Excel (SheetJS), realtime.

## Milestones
1. **(this)** SKU-category analysis + Conflict Report + authored migrations.
2. Scaffold the `tradespend` mode in the Dashboard shell.
3. Port data layer (activities CRUD + realtime + sales adapter).
4. Port UI (Log / New / Analysis) to the Dashboard design system.
5. Replace hardcoded auth with `ts.*` RBAC.
6. Validate parity vs legacy; produce screenshots + reports; await approval.
