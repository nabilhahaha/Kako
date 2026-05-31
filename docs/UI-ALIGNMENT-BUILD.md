# VANTORA — UI Alignment Build: Navigation Binding + Inline Role Suggestions

> Deferred R4B follow-up. Binds the nav to enabled Core Modules + Industry Packs
> and adds **editable** suggested roles to company creation. Hard constraint:
> **no tenant (existing or new) loses access**; protected verticals unchanged.

---

## 0. Build status — IMPLEMENTED (code-only; no DB change) ✅

Shipped in this slice (all code-only — **no migration, no new RPC**):

1. **`field_ops` capability nav binding (any-of, regression-proof).** The three
   field-sales items (`/rep`, `/sales/settlement`, `/sales/journey`) are bound to
   **`['field_ops','distribution']`** — visible if the company has **either**
   module. `NavItem.module` / `NavSection.module` now accept `Module | Module[]`
   and `moduleAllowed` evaluates an array as **ANY-of**.
   - *Why any-of, not a pure rebind:* `field_ops` is plan-gated to Professional+
     (migration 0095), while `distribution` is granted on **all** plans (0063). A
     pure rebind to `field_ops` would have **hidden** the rep app for existing
     **free/standard** distribution tenants. The any-of gate keeps the legacy
     `distribution` path working while *also* recognising the new `field_ops`
     capability → strictly additive, can never hide a previously-shown item.
2. **New-company bridge (code-only).** The setup wizard's "Do you have field
   sales reps? → Yes" answer now also enables **`field_ops`** (alongside the
   existing `distribution`/`sales_orders`), so new field-sales companies populate
   the capability module. Entitlement is still plan-gated; visibility is covered
   by the `distribution` arm for free/standard.
3. **Inline Suggested Roles step.** A dedicated wizard step (separate from the
   Modules step, before Review) lists the **pack-generated** suggested roles with
   friendly bilingual labels and a clear note that they are **created
   automatically and fully editable later in Settings → Permissions**. Roles
   remain seeded by the existing `erp_seed_company_roles` trigger — **no new write
   path, no new RPC**.
4. **Clear separation retained.** Wizard order: business questions → **Modules**
   (Core vs Industry Pack groups) → **Suggested Roles** → Review. Marketplace
   already groups Core vs Packs.

**Deferred (needs a follow-up universal capability seed migration — excluded by
the "no production DB changes" constraint of this slice):** universal nav gating
of `crm` (Customers), `workflow` (Approvals / Settings→Workflows), `analytics`
(Reports) and `integrations` (Settings integration items). Binding these today
would regress **new** companies of business types not seeded with those
capabilities by 0095 (e.g. `general`, `cafe`, `clothing`), because their plans/
business-type templates don't yet enable them. Existing tenants are already
backfilled (0095); the gap is only new-company seeding, which a small additive
seed migration (or extending the wizard profiles' default toggles) closes safely
in the next slice.

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

## 4. Part C — Inline role suggestions (company creation) — REUSE existing
Roles are **keyed** (`erp_company_roles.role_key`, from the `erp_roles` catalog),
already seeded per business type from **`erp_business_type_roles`** by the
existing **`erp_seed_company_roles(company_id)`** RPC (with default permissions
from `erp_role_permissions`). So we **reuse that entire mechanism** — no new
role-creation RPC, no free-text roles:
- **Suggestion source = `erp_business_type_roles`** for the company's business
  type (the same templates that already drive seeding). `PACK_ROLE_SUGGESTIONS`
  becomes a **display-label map** (role_key → friendly name, e.g. `warehouse_keeper`
  → "Storekeeper", `manager` → "Clinic/Branch Manager") so the wizard shows the
  approved names while persisting catalog `role_key`s.
- **Wizard "Suggested Roles" step** (separate from Modules/Packs): lists the
  business-type role_keys (labeled), **toggle enable/disable** before finishing.
- **Persist by reusing existing paths:** `erp_seed_company_roles` seeds the
  template roles at creation; the wizard's enable/disable reuses the **existing
  company-role management action** (the one Settings → Permissions already uses) —
  no new write path.
- **Remain editable** afterward in Settings → Permissions/Roles (existing editor).

## 5. Clear separation (requirement 5)
Wizard steps: business questions → **Industry Pack** → **Core Modules** →
**Suggested Roles** → review. Marketplace already groups Core vs Packs. Roles are
their own step/screen — never mixed with module toggles.

## 6. Migration — none required (reuse) ✅
Per goal #4, this slice **reuses existing RPCs** and adds **no migration**:
- Modules: enabled via the existing **`erp_apply_setup_modules`** RPC (answers map
  already supports any module key; 0095 already seeded plan/business-type rows).
- Roles: seeded via the existing **`erp_seed_company_roles`** + managed via the
  existing role action.
- Nav binding + wizard grouping + role-label map are **code-only** (no DB change).
- *(If a business type's recommended capability rows need topping up, that's
  data already handled by 0095 — no new migration.)*

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

## 9. Decisions — RESOLVED (recommended defaults + reuse)
1. **Field Ops rebind** — rep/journey/settlement nav gate `distribution` →
   `field_ops` (both backfilled for existing; new field/distribution tenants get
   `field_ops` via the bridge). ✅
2. **Roles** — **reuse** `erp_business_type_roles` + `erp_seed_company_roles`
   (keyed roles + default permissions already handled); wizard surfaces them as
   editable enable/disable with friendly labels; full editing in Settings. **No
   new role RPC.** ✅
3. **Free-tier nav** — capability modules a tier doesn't grant are hidden for
   **new** companies on that tier (correct entitlement); existing tenants keep
   everything via the 0095 backfill. ✅
4. **Migration** — **none** (reuse existing RPCs/entitlement). ✅

## 10. What gets built (code-only)
- `navigation.ts`: bind sections/items to Core Module + Pack keys (per §3);
  Field Ops rebind. (Permission gates retained.)
- Setup Wizard: ensure capability modules are in the profile defaults (per plan ∩
  business-type) so new tenants enable them; add the **Suggested Roles** step
  (labeled, editable enable/disable) reusing the role action.
- `licensing-catalog.ts`: role-key → display-label map (the approved names).
- Tests: `visibleSections` (existing-superset / new-tier / protected verticals);
  role-label mapping; setup-profile capability inclusion.

*(Final UI Alignment Build design — decisions resolved, no migration, reuse-first.
On your go-ahead I build it → test → (no prod migration) → draft PR → review,
then B3b.)*
