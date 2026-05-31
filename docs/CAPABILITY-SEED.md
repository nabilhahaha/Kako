# VANTORA — Capability-Seed Slice — Design Review

> Build-track slice **Capability-Seed** — **design for approval, no
> implementation yet.** The final tracked item from the R4B / UI-Alignment work:
> close the **new-company** seeding gap so CRM / Workflow / Analytics /
> Integrations can be **navigation-gated universally** without regressing newly
> created tenants. Additive + idempotent; rollback-verified; **no deletions;
> protected verticals unchanged**; reviewed against the official baseline — no
> baseline architecture change.

---

## 1. The exact gap (grounded)
- **Existing tenants** are already safe: migration **0095** backfilled
  `crm/workflow/analytics/field_ops` enabled for **every** existing company
  (integrations only where in use).
- **New companies** seed their modules from `erp_business_type_modules` via
  `erp_seed_company_modules()` (0036), run by the company-creation trigger.
- **0095 only added capability recommendations for *some* business types**
  (`clinic, pharmacy, delivery, wholesale, electronics, hotel, salon, laundry`).
  The rest — `general, clothing, bakery, butchery, workshop, restaurant, cafe,
  services, auto_parts, bookstore, supermarket` — have **no** capability rows.
- **Consequence:** if nav were gated universally on `crm/workflow/analytics`
  today, a **new** company of an unseeded type would have them **off** → those
  sections would hide. This is precisely why the UI-Alignment slice bound only
  `field_ops` (any-of) and deferred the rest. **This slice closes that gap.**

## 2. What this slice does (two parts)
### Part A — Universal capability seed (migration 0098, additive)
Add capability-module recommendations to `erp_business_type_modules` for **all**
business types that lack them, so `erp_seed_company_modules()` enables them on
new-company creation:
- **`crm`, `workflow`, `analytics`** → seed for **every** business type (these are
  the always-available capabilities 0095 already enabled for all existing
  tenants — so new + existing become consistent).
- **`field_ops`** → only the field-relevant types (`delivery, wholesale,
  electronics, general` — those whose setup wizard offers reps); already partially
  seeded by 0095/0063. Not universal (a clinic/salon doesn't need it).
- **`integrations`** → **NOT auto-seeded** (stays opt-in / off-by-default, exactly
  as 0095 treated existing tenants — enabled only when API keys/webhooks/
  connections exist). Its nav stays bound to the existing `integrations.manage`
  permission, **not** universally module-gated (decision §6.3).
- **Plan gate unchanged:** entitlement is still plan ∩ business-type ∩ company —
  e.g. a Free company only gets the capabilities its tier grants (0095 matrix).

> Net: a newly created company of **any** type enables tier-appropriate
> `crm/workflow/analytics` (+ `field_ops` where relevant) → nav gating is safe.

### Part B — Navigation binding (code-only, after Part A is in place)
Bind the capability sections/items in `navigation.ts` to their module keys, the
same proven, permission-gated pattern already used for `field_ops`:
| Nav area | Bound module (any-of where a legacy gate exists) |
|---|---|
| Customers | `crm` |
| Approvals + Settings→Workflows | `workflow` |
| Reports / sales report / analytics views | `analytics` |
| Field sales (rep/journey/settlement) | `['field_ops','distribution']` (already done) |
| Settings→Integrations / API keys / webhooks / connections / sync | **stays on `integrations.manage` permission** (not universally module-gated — §6.3) |

- **Permission gates stay** — a section shows only if the module is enabled **and**
  the user holds the permission (no spurious exposure).
- **Existing-tenant safety:** 0095 already enabled these for all existing
  companies, so binding hides nothing for them.
- **New-tenant safety:** Part A guarantees new companies enable them.
- **Protected verticals:** their vertical sections keep their existing
  vertical-module gate — untouched.

## 3. Why this is now safe (it wasn't before)
The UI-Alignment slice correctly deferred this because the **new-company seed**
didn't include the capabilities. Part A fixes the seed; only **then** does Part B
bind nav. Order matters and is enforced within the single slice (migration seeds
first; nav binding ships in the same PR but is inert until a company has the
modules, which both existing (0095) and new (0098) companies now do).

## 4. Migration `0098` (additive, idempotent)
1. `erp_business_type_modules` — insert `crm/workflow/analytics` for every
   business type present that lacks them (guarded `NOT EXISTS`); `field_ops` for
   the field-relevant types.
2. **Optional consistency backfill** (recommended): re-affirm
   `crm/workflow/analytics` enabled for existing companies via
   `erp_seed_company_modules`-style `NOT EXISTS` insert — a no-op after 0095, but
   keeps the seed self-contained and idempotent.
3. No schema change, no deletions, no permission changes, no plan changes.

## 5. Verification plan (when built)
- **Rolled-back live (production project):** simulate creating a company of an
  **unseeded** type (e.g. `general`, `cafe`) → confirm `erp_seed_company_modules`
  now enables `crm/workflow/analytics`; confirm existing tenants unchanged (0095
  already covered them → 0 deltas); advisor 0 ERROR; protected verticals
  untouched; **0 residue after rollback**.
- **Unit (`navigation.test.ts`):** Customers gated by `crm`; Approvals/Workflows
  by `workflow`; Reports by `analytics`; existing-tenant superset still shows all;
  a company missing a capability hides exactly that section; protected verticals
  present; permission still required.
- `tsc` / `next build` / `vitest` + i18n parity. **Production apply held for
  approval.**

## 6. Decisions to confirm (before building)
1. **Universal `crm/workflow/analytics`** seed for **all** business types
   (consistent with the 0095 existing-tenant backfill)? *(Recommended.)*
2. **`field_ops`** seeded only for field-relevant types (not universal)?
   *(Recommended — matches reality.)*
3. **`integrations`** stays **opt-in / permission-gated** (NOT universally
   module-gated, NOT auto-seeded) — so we never show integration nav to a tenant
   that hasn't enabled it? *(Recommended — preserves the off-by-default posture.)*
4. **One PR** (migration Part A + nav binding Part B together, seed-before-bind
   within the slice)? *(Recommended — they're interdependent; the binding is inert
   without the seed.)*
5. **Plan gate unchanged** (Free still limited per the 0095 tier matrix)?
   *(Recommended.)*

*(Capability-Seed design — paused for your review + the §6 decisions. On approval
I build → rolled-back live verify → tests → draft PR → review package; **no
production apply without approval**. This completes the final tracked roadmap
item from the R4B / UI-Alignment program.)*
