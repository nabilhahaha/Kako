# Pilot Walkthrough — FMCG demo tenant (code-grounded)

> **Method.** A *live* per-role click-through needs the demo seed + migrations
> applied on a reachable Supabase and per-role logins — that's the "per-role smoke"
> Go/No-Go hold item, run on the demo project. This walkthrough instead **traces
> every journey through the actual routes, components, permissions, and RLS** (the
> source of truth) and flags issues. Build is green; nothing is asserted that the
> code doesn't do. Issues use 🔴 blocker · 🟠 should-fix · 🟡 polish.

---

## 1. Admin journey
| Step | Screen (route) | What admin does | Notes |
|---|---|---|---|
| Company setup | `/setup` (first run) → `/settings` | business type, modules; `setup_done` | wizard toggles modules; **seeds no business data** |
| Branches | `/settings/branches` | CRUD branches, set HQ, link region/area | gated `settings.branches` |
| Regions / Areas | `/settings/regions` | two-panel CRUD + region→area + activate | S1; gated `settings.branches` |
| Users | `/settings/users` (+ `/settings/staff`) | invite/assign users to branches + role | `superAdminOnly` / `settings.users` |
| Roles | `/settings/permissions` (matrix) + `/settings/organization` | tune permissions per role; departments/teams/job titles | see issue A1 |
| Customer master data | `/settings/customer-data` | manage segment/class/channel values | S3; gated `settings.custom_fields` |

**Findings**
- **A1 🟡 No standalone "create role" screen.** Roles come from business-type
  templates; admins tune them in the **permission matrix** (`/settings/permissions`).
  An admin expecting a "New Role" button won't find one (role-*label* customization
  is the planned S3b). Pilot-acceptable; document it.
- **A2 🟡 Onboarding lands on empty screens** (no starter data) — mitigated by the
  FMCG demo seed and UX-5 empty-state CTAs. Consider auto-creating one default
  price list per company.
- ✅ Company → branches → regions/areas → users → master data is a coherent,
  permission-gated path.

## 2. Sales Director / NSM journey
| Step | Screen | Gated by | Status |
|---|---|---|---|
| Customer management | `/customers` | `customers.manage` ✅ | grouped form (UX-2), filters, cards on mobile |
| Pricing management | `/sales/pricing` | `pricing.manage` | **✅ now reachable** (pilot-hardening grant) |
| Customer import | `/settings/import` | `integrations.manage` | **🟠 NOT reachable for director/NSM** — see B1 |
| Reporting visibility | `/sales/report`, `/accounting/reports`, `/accounting/aging` | `reports.view` / `accounting.view` ✅ | director/NSM are **company-wide** (S4) → see all |

**Findings**
- **B1 🟠 Sales Director / NSM cannot reach the Import wizard.** `/settings/import`
  is gated `integrations.manage`, held by IT-Admin/Admin only. The requested
  "Sales Director → Customer import" journey is **blocked** for that role.
  **Fix (small):** grant `integrations.manage` (or a narrower `data.import` perm)
  to `sales_director`/`national_sales_manager`, **or** decide import is an
  Admin/IT-run task and document it. *(Same class as the pricing grant we just
  added — I can fold it into the hardening slice on your nod.)*
- ✅ The earlier gap (director couldn't open Pricing) is **closed** by the hardening
  slice — verify by signing in as `sales_director` and opening Sales → Pricing.

## 3. Supervisor journey
| Step | Screen | Mechanism | Status |
|---|---|---|---|
| Team visibility | *(no dedicated screen)* | — | **🟠 gap — see C1** |
| Customer visibility | `/customers` | S4 RLS: supervisor sees **reps-reporting-to-me + branch** customers | ✅ scoped |
| Route visibility | `/distribution/routes` | S4b: supervisor sees **their reps' routes** | ✅ scoped (needs distribution module) |

**Findings**
- **C1 🟠 No dedicated supervisor "team roster" screen.** Supervision works through
  *scoped* lists (the supervisor sees their reps' customers/routes via RLS), but
  there is **no explicit "My Team / Reps" view** to see who reports to them, their
  coverage, or targets at a glance. For a pilot this is a usability gap, not a data
  gap. **Rec (post-pilot):** a lightweight Supervisor → Team screen (reps via
  `reports_to` + their customer/route counts). Document the workaround for pilot.
- **C2 🟡 Supervisor scope depends on `reports_to` being populated.** If demo/pilot
  reps aren't linked to their supervisor (`erp_user_branches.reports_to`), the
  supervisor falls back to **branch-only** visibility. Ensure the demo users seed /
  pilot setup sets `reports_to`.

## 4. Sales Rep journey
| Step | Screen | Mechanism | Status |
|---|---|---|---|
| Customer list | `/customers` | S4: rep sees **own** customers (salesman_id) + their routes | ✅ scoped + mobile cards |
| Create customer | `/customers` (form) | `customers.manage` + S4b **write-scope** | **🟠 see D1** |
| Create order | `/sales/orders` | `sales.sell`; price auto-resolves; unapproved-customer gate | ✅ (hardening) |
| Create invoice | `/sales/invoices` | `sales.sell`; resolver + credit/stock pre-checks | ✅ (hardening) |
| Mobile | bottom tab bar (Home/Customers/Sell/Inventory/More) + card lists | UX-3 | ✅ customers & invoices as cards |

**Findings**
- **D1 🟠 A rep creating a customer must self-assign or it fails.** S4b write-scope
  (`WITH CHECK`) lets a scoped rep insert a customer **only if it's in their scope**
  — i.e. `salesman_id = themselves`. The create form defaults the rep field to
  *None*, so a rep who doesn't pick themselves hits an **opaque RLS error**, and
  even on success a customer they didn't self-assign **won't appear** in their list.
  **Fix (small):** when the creator is a scoped rep, default/auto-set
  `salesman_id = current user` on the customer form/insert. High-value pilot polish.
- **D2 🟡 Rep app `/rep` vs `/customers`** — reps have two customer entry points
  (the rep app and the general customers screen). Confirm which one the pilot reps
  use; the bottom-nav "Customers" points to `/customers`.
- ✅ Order/invoice creation now resolves engine prices and blocks over-credit /
  insufficient-stock (tracked products) — strong pilot guardrails.

## 5. Import journey
| Step | Screen | Behavior | Status |
|---|---|---|---|
| Upload | `/settings/import` step 2 | CSV/JSON (client) + XLSX (server) | ✅ |
| Mapping | step 3 | **manual-first** (UX-4): fields start unmapped; opt-in Auto-map; per-company templates | ✅ |
| Validation | step 4 | required-unmapped gate + 50-row preview + issue badges | ✅ |
| Import | step 5–6 | insert/update/upsert + job log + error export | ✅ |

**Findings**
- **E1 🟡 Importing customers can't map FK master-data by name.** segment/channel/
  region are set in the form, not the import map (codes won't resolve to ids in a
  bulk customer import yet). Fine for pilot (set in form); note for bulk migrations.
- **E2 🟠 (= B1) Access:** only `integrations.manage` roles reach Import. If reps/
  sales leadership are expected to import, see B1.
- ✅ Manual-first + per-company templates is exactly the onboarding/migration story.

## 6. Pricing journey
| Step | Screen | Behavior | Status |
|---|---|---|---|
| Base price | product `sell_price` | the fallback floor | ✅ |
| Price list | `/sales/pricing` → Lists | default list `FMCG Standard` + items (demo seed) | ✅ |
| Customer-specific | `/sales/pricing` → Rules (Customer scope, pilot default) | demo: fixed price on Oil 1L for the key account | ✅ |
| Resolution example | order/invoice line for that customer + product | resolver: **customer > segment > list > base** | ✅ verified by P-a DB test |

**Worked example (from the demo seed).** Oil 1L base `sell_price = 45`; list
`FMCG Standard` item = 45; **segment rule** 5% off (wholesale) → 42.75; **customer
rule** fixed 42 for the key account `FD-C0002`. Resolver returns **42** for that
customer (customer beats segment beats list), and **42.75** for any other wholesale
customer, else **45**. (This is exactly what the P-a integration test asserts.)

**Findings**
- **F1 🟡 Pricing is customer-first by design (pilot).** Advanced scopes
  (segment/channel/region/area/global) are behind "Show advanced scopes" — correct
  per your pilot decision; just set expectations with pilot users.
- ✅ Override logging: editing a resolved line price writes an audit `override`.

---

## 7. Consolidated issues
| ID | Severity | Issue | Recommended fix | Blocks pilot? |
|---|---|---|---|---|
| B1/E2 | ✅ **fixed** | Director/NSM couldn't reach **Import** | Granted `integrations.manage` to Sales Director/NSM (migration 0108 + TS) | — |
| D1 | ✅ **fixed** | Rep create-customer failed/disappeared without **self-assign** | Rep now auto-assigns `salesman_id = self` on create | — |
| C1 | 🟠 | No **supervisor team roster** screen | Lightweight Supervisor → Team view (post-pilot); workaround = scoped lists | No (usability) |
| C2 | 🟡 | Supervisor scope needs `reports_to` populated | Set `reports_to` in demo/pilot setup | No |
| A1 | 🟡 | No "create role" screen (matrix only) | Document; S3b later | No |
| A2 | 🟡 | Empty screens after onboarding | Demo seed / default price list | No |
| D2 | 🟡 | Two customer entry points (`/rep` vs `/customers`) | Confirm rep path | No |
| E1 | 🟡 | Bulk customer import can't map segment/region by name | Form-set for pilot; add resolver later | No |
| — | 🟡 | Mobile cards only on customers/invoices | Roll to products/orders (UX follow-up) | No |

**No 🔴 hard blockers.** The two 🟠 fixes (**B1** import access, **D1** rep
self-assign) are now **closed** in the hardening slice (#72); **C1** (supervisor
team screen) is a post-pilot usability add with a documented workaround.

## 8. Final Go / No-Go recommendation
**GO for pilot.** The two pre-pilot fixes are applied:
1. **D1 ✅** — a Sales Rep now auto-assigns themselves on customer create.
2. **B1 ✅** — `integrations.manage` granted to Sales Director/NSM (migration 0108)
   so sales leadership can run Import.
Remaining are the standing deployment steps in `PILOT-MERGE-PLAN.md` §5: merge the
stack, apply `0103–0108` to the pilot tenant, run the demo seed, and the live
per-role smoke — then the production migration on your final approval.

Everything else is polish or post-pilot. The platform is feature-complete, scoped,
validated, and pilot-appropriate (simple by default, enterprise depth on demand).

*(Walkthrough is code-grounded — no production change. Production migrations remain
on hold pending your review of the full stack + demo tenant.)*
