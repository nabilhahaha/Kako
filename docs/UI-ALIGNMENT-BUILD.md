# VANTORA — UI Alignment Build: Navigation Binding + Inline Role Suggestions (design)

> Deferred R4B follow-up. **Design for approval — no build yet.** Binds the
> nav to enabled Core Modules + Industry Packs and adds **editable** suggested
> roles to company creation. Hard constraint: **no tenant (existing or new) loses
> access**; protected verticals unchanged.

---

## 1. The regression risk this design must solve
Gating nav by capability modules is only safe if **every** tenant has the
relevant modules enabled:
- **Existing tenants** — ✅ already backfilled by `0095` (crm/workflow/analytics/
  field_ops enabled for all; integrations for users).
- **New tenants** — ❌ today: company creation enables modules from the setup
  wizard profile, which did **not** include the new capability keys → a newly
  created company would have them *off* → nav would hide them. **This is the gap
  the build must close before binding nav.**

## 2. Part A — New-company enablement bridge (prerequisite)
Make new companies enable the capability modules by default:
- The setup flow writes modules via the `erp_apply_setup_modules` RPC from the
  business-type **profile** (`setup-wizard.ts`), which is seeded from
  `erp_business_type_modules` — **0095 already added** the capability
  recommendations per type (clinic→crm/workflow/analytics, delivery→…, etc.).
- **Change:** ensure the setup profile's `moduleToggles` **include the capability
  modules** (defaulted on per the pack via `PACK_CORE_PRESELECT` /
  `erp_business_type_modules`), so `erp_apply_setup_modules` enables them.
- **Plan gate:** only enable modules the plan grants (`erp_plan_modules`, seeded
  in 0095) — e.g. a Free company gets CRM+Sales; Workflow/Field Ops come with
  Professional+. (Entitlement = plan ∩ enabled.)
- **Net:** new tenants get tier-appropriate capability modules enabled →
  nav binding shows the right sections; nothing missing that they're entitled to.

## 3. Part B — Navigation binding (after the bridge)
Bind `navigation.ts` sections/items to module keys so `visibleSections` (already
module-aware) gates by **enabled Core Modules + Packs**:

| Nav area | Bound module |
|---|---|
| Customers | `crm` |
| Sales section (POS item `pos`, orders `sales_orders`, returns `returns`) | `sales` (+ finer item modules, existing) |
| Inventory / stock / warehouses | `inventory` |
| Suppliers / purchases | `purchasing` |
| Accounting (journal/vouchers/aging) | `accounting` (Finance) |
| Approvals + Settings→Workflows | `workflow` |
| Reports / sales report | `analytics` |
| Field sales (rep / journey / routes / settlement) | `field_ops` |
| Settings→Integrations / API keys / webhooks / connections / sync | `integrations` |
| Clinic / Pharmacy / Restaurant / Salon / Laundry / Hotel / Wholesale / Market(Retail) | their **vertical pack** key (unchanged) |

- **Permission gates stay** (an item shows only if module enabled **and** the
  user has its permission) — so no spurious exposure.
- **Field Ops:** today rep/journey are gated by `distribution`; rebind to
  `field_ops` (backfilled for all existing; new field/distribution companies get
  it) — distribution pack still gates the Distribution section itself.
- **Protected verticals:** their sections keep their existing vertical-module
  gate — untouched.

## 4. Part C — Inline role suggestions (company creation)
- In the Setup Wizard, replace the static "suggested roles" preview with an
  **editable list** seeded from `PACK_ROLE_SUGGESTIONS[pack]` (pack via
  `packForBusinessType`) / `erp_business_type_roles`:
  - add / rename / remove rows before finishing.
- On finish, persist the chosen roles as **company roles** (`erp_company_roles`)
  via a guarded RPC (`erp_apply_suggested_roles`, SECURITY DEFINER, owner/admin,
  idempotent — skip roles that already exist). 
- **Remain editable** afterward in Settings → Users/Permissions (existing).
- Roles are presented as a **separate step** from Modules/Packs (clear
  separation).

## 5. Clear separation (requirement 5)
Wizard steps: business questions → **Industry Pack** → **Core Modules** →
**Suggested Roles** → review. Marketplace already groups Core vs Packs. Roles are
their own step/screen — never mixed with module toggles.

## 6. Migration (small) — `0096`
- `erp_apply_suggested_roles(p_roles text[])` SECURITY DEFINER (owner/admin guard,
  pinned search_path, anon-revoked, audited) — inserts missing `erp_company_roles`
  for the caller's company. (No change to existing roles.)
- Possibly extend `erp_apply_setup_modules` only if needed to accept the
  capability keys (it already takes the answers map — likely no change).
- Additive/idempotent; **no deletions; protected verticals untouched.**

## 7. No-regression strategy (summary)
- Existing tenants: backfilled (0095) → keep everything.
- New tenants: bridge (Part A) enables tier-appropriate capabilities → nav shows
  them.
- Verify (rolled-back live + unit): a sample existing company's `visibleSections`
  is unchanged (same sections visible before/after binding); a simulated new
  company on each plan/business-type shows the expected sections; protected
  vertical sections unaffected.

## 8. Verification plan (when built)
- Unit: `visibleSections` with representative module/permission sets (existing
  tenant superset; new-tenant tier sets; protected verticals present).
- Rolled-back live: `erp_apply_suggested_roles` (creates roles, idempotent,
  guard, audit); advisor 0 ERROR + not anon-executable; cross-company isolation.
- `tsc`/build/vitest + i18n parity. Production apply held for approval.

## 9. Decisions to confirm (before building)
1. **Field Ops rebind** — move rep/journey/settlement nav gate from
   `distribution` to `field_ops` (recommended; both backfilled) — OK?
2. **Role creation depth** — create role *names* now (assignable, permissions
   editable later) vs also seed default permissions per role? *(Recommend names
   now; permissions via existing role editor — keeps the slice safe.)*
3. **Free-tier nav** — confirm capability modules a tier doesn't include are
   hidden for **new** companies on that tier (correct entitlement) — acceptable?
4. **Migration 0096** for `erp_apply_suggested_roles` — OK to add (small,
   guarded, additive)?

*(UI Alignment Build design — paused for your review. After approval: build →
test → rolled-back live verification → draft PR → review package, then B3b.)*
