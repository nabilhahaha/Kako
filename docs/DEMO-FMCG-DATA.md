# FMCG Demo Data

`supabase/demo/fmcg_demo_seed.sql` — a realistic, **idempotent**, demo-tenant-scoped
FMCG dataset that exercises the platform end-to-end for pilot demos.

## What it creates (scoped to the "VANTORA FMCG Demo" tenant)
- **Company** (`business_type = wholesale`) — find-or-create; creation triggers the
  standard role/module/customer-lookup seeding. HQ **branch** + **warehouse**.
- **S1 hierarchy** — regions (Greater Cairo, Delta) + areas (Cairo East/West,
  Tanta); the HQ branch is linked to a region/area.
- **S3 customer master data** — the seeded segment / classification / channel
  values (ensured idempotently).
- **Products** — 10 FMCG SKUs across 4 categories (oils, grains/sugar, dairy,
  beverages) with cost/sell/VAT.
- **Customers (24)** — the **full S3 model**: segment, classification, channel,
  region/area, GPS, credit limit, payment terms, CR number, contact. Varied across
  segments/channels/classes/regions. One key account joins a **Wholesale tier**.
- **Pricing** — a default **price list** (`FMCG Standard`) with items, plus two
  **price rules** that showcase resolution: a **customer-specific fixed** price and
  a **segment % off** on Oil 1L (so a demo shows customer > segment > list > base).
- **Routes** — Cairo East / Delta (with the demo warehouse as van stock).
- **Sample DRAFT** sales orders + invoices (with lines + rolled-up totals). Draft
  only → **no stock or GL side effects**; issuing is a normal user action in the demo.

## How to run
- This is a **data script, not a migration** — CI never applies it, and it never
  touches production. Run it once on the **demo** Supabase project (SQL editor or
  `psql`) after migrations `0101–0106` are applied there.
- **Idempotent:** every insert is guarded (`ON CONFLICT … DO NOTHING` / `NOT
  EXISTS`), so re-running only fills gaps.
- Optional companion: `supabase/demo/fmcg_demo_users_and_data.sql` seeds demo users
  on the same tenant (assign them as region/area managers to demo S4 scope).

## Notes
- The demo tenant UUID is fixed in the script; change it if your demo project uses
  a different company.
- To demo **hierarchy scope (S4)**, set `manager_id` on a region/area to a demo
  user and sign in as that user — they'll see only their region/area's customers.
- To demo **pricing**, open Sales → Pricing (the rules are visible) and add a line
  for the key-account customer on Oil 1L to see the resolved price.
