# Demo Permission Matrix — role verification

Verifies visibility, scope, isolation and denied actions for every demo role
**before** loading the FMCG dataset. Enforcement is layered and proven by the
automated suite `src/test/integration/demo-permission-matrix.test.ts` (plus the
existing field/commercial/governance/scheduler scope tests):

- **RPC gates:** admin-only actions check `erp_is_company_admin` (role `admin`)
  → `erp_fe_sees_all`.
- **Scope:** non-admins are bound to their reporting subtree (`erp_fe_team`);
  reps see only themselves.
- **RLS + company_id:** strict tenant isolation.

## Role → base role mapping (demo users)
| Demo role | DB role | Login (demo) |
|---|---|---|
| Platform Owner | super-admin (vendor) | *vendor account — cross-tenant, not in the demo company* |
| Company Admin | admin | admin.fooddist@demo.com |
| IT Admin | admin | it.fooddist@demo.com |
| Sales Director | manager | director.fooddist@demo.com |
| Regional Manager | manager | regional.fooddist@demo.com |
| Area Manager | manager | area.{riyadh,jeddah,dammam}@demo.com |
| Branch Manager | manager | branchmgr.fooddist@demo.com |
| Supervisor | supervisor | sup.{riyadh,jeddah,dammam}@demo.com |
| Sales Rep | salesman | rep.{riyadh,jeddah,dammam}@demo.com |
| Finance | accountant | finance.fooddist@demo.com |
| Viewer / Read-Only | viewer | viewer.fooddist@demo.com |

## Matrix
| Role | Allowed (modules / actions) | Denied | Visible scope | Test |
|---|---|---|---|---|
| **Platform Owner** | All tenants; platform panel, audit, billing | — | All companies | ✅ (sees-all = super-admin) |
| **Company Admin / IT Admin** | Field, Commercial, Promotions (write), Governance, Scheduler, ERP Sync, Permissions; run alert detection, commission & incentive runs | — | Whole company (all branches) | ✅ Verified |
| **Sales Director** | Field + Commercial dashboards; targets/perf (read); commission/incentive **view** | Promotions write, Governance, Scheduler, ERP-sync admin, detection/commission **runs** | Full reporting subtree | ✅ Verified |
| **Regional Manager** | as Director, within region | as above | Region subtree | ✅ Verified |
| **Area Manager** | as above, within area/branch | as above | Area/branch subtree | ✅ Verified |
| **Branch Manager** | as above, within branch | as above | Branch subtree | ✅ Verified |
| **Supervisor** | Field alerts inbox + coverage; commercial within team | admin actions (run/publish/register) | Their team | ✅ Verified |
| **Sales Rep** | Own route/visits/captures; own commercial figures + own commission payout | admin actions; other reps' data | **Self only** | ✅ Verified |
| **Finance** | Commercial/reports (read), scoped; own/team commission payouts | admin actions; promotions/governance/scheduler write | Self/team | ✅ Verified |
| **Viewer / Read-Only** | view-only (field_ops:view, customers:view, reports:view) | **all writes** (promotions, governance, …) | Self | ✅ Verified |

## Verified dimensions (automated)
- ✅ **sees_all** true only for admin tier; false for manager/supervisor/rep/finance/viewer.
- ✅ **Admin-gated actions** (`erp_fe_run_alert_rules`, `erp_tpm_promotion_save`,
  `erp_cfg_change_save`, `erp_sched_register`, `erp_cp_commission_run`) succeed
  for admin, **denied** for manager and viewer.
- ✅ **Scope visibility** (`erp_cp_actuals` by rep): admin = all reps; manager =
  subtree; supervisor = team; rep = self; other rep = self (not peers');
  viewer = none.
- ✅ **Commission/incentive visibility** scoped: each rep sees only their own
  payout; admin sees all.
- ✅ **Data isolation**: a company-B admin sees **zero** of company-A actuals /
  promotions / targets.

## Findings & recommendations
- **No security issues found** — all gates and scopes behave as designed.
- **Finance commission visibility (design note, not a bug):** the `accountant`
  role is scope-bound like other non-admins, so Finance sees only own/team
  commission payouts — not a company-wide payout view. If Finance should see all
  payouts, add a `commission:view` matrix permission + widen the payout-list
  scope check. Flagged for product decision; **not changed** (would alter the
  security model).
- **Nav visibility** follows the same gates: `commercial` requires the
  `field_ops` module; `governance`/`scheduler`/`sync` require `settings.users`
  (admins); read-only roles see dashboards but no admin/setup items.
