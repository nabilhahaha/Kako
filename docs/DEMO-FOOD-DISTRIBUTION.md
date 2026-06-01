# Demo — Food Distribution Company (realistic KSA FMCG, end-to-end)

A self-contained FMCG/food-distribution demo tenant (KSA, SAR) for testing the
full admin journey. **Demo/pilot data only — never part of the migration chain,
so it cannot reach production.**

## Apply / re-apply (preview / non-prod only)
```bash
psql "$PREVIEW_DATABASE_URL" -f supabase/demo/food_distribution_seed.sql
```
Idempotent (fixed UUIDs + `ON CONFLICT`). **Teardown:**
```sql
delete from erp_companies where id = 'da000000-0000-4000-8000-000000000001';
```

## Logins  (shared password: `Demo@2026`)
| Demo role | Email | Branch |
|---|---|---|
| Company Admin | `admin.fooddist@demo.com` | all |
| Sales Director | `director.fooddist@demo.com` | all |
| Regional Manager | `regional.fooddist@demo.com` | all |
| Area Manager — Riyadh | `area.riyadh@demo.com` | Riyadh |
| Area Manager — Jeddah | `area.jeddah@demo.com` | Jeddah |
| Area Manager — Dammam | `area.dammam@demo.com` | Dammam |
| Supervisor — Riyadh/Jeddah/Dammam | `sup.riyadh@demo.com` / `sup.jeddah@demo.com` / `sup.dammam@demo.com` | resp. |
| Sales Rep — Riyadh/Jeddah/Dammam | `rep.riyadh@demo.com` / `rep.jeddah@demo.com` / `rep.dammam@demo.com` | resp. |
| Finance | `finance.fooddist@demo.com` | Riyadh |
| IT Admin | `it.fooddist@demo.com` | Riyadh |

**FMCG hierarchy:** Director → Regional → 3 Area Managers (one per branch) → 3
Supervisors → 3 Reps (+ Finance under Director). 14 users total.

## What's seeded
- **Branches (3):** Riyadh (Central), Jeddah (Western), Dammam (Eastern).
- **Channels (4):** retail · wholesale · key_account · discount. **Classes:** A/B/C.
- **Products:** 2 categories → 2 sub-categories → brands (AquaCola, CrunchCo) → 4 SKUs.
- **3 routes, 9 customers** across branches/channels/classes.
- **Invoices:** this month / last month / last year per branch rep → achievement +
  YoY & prior-period growth, drillable region→area→branch→route→rep.
- **Targets:** rep + company, current month, active.
- **Promotions (4):** 10% Discount (retail) · Buy 5 Get 1 (Cola) · Buy 10 Get 2
  (Chips) · Bundle (Cola 6 + Chips 2, key_account) — with channel/SKU targeting;
  the Bundle is `approved` so the Promotion-Activation job can flip it to active.
- **Commission plan:** rep, value, **tiered** (≥110→6%, ≥90→4%, else 2%) with
  **coverage ≥ 80%** + **execution score ≥ 70%** qualification.
- **ERP integration:** `erp_sync_map` mappings (system `odoo`, source `rest`) +
  ingest runs (customer/product/invoice) → shown at `/settings/sync`.
- **Scheduler jobs (3):** ERP Sync · Promotion Activation · Daily Digest (all
  runnable from `/settings/scheduler`).
- **Governance:** one **published** flag (`commercial_dashboard`) + one **draft**
  change (`beta_reports`, piloted by the admin) → test Draft → Pilot ("view as")
  → Publish → Rollback.

## Admin journey checklist
1. Login as Company Admin → Field, Commercial, Promotions, Statements, Sync,
   Scheduler, Governance, Users/Roles.
2. Commercial: drill region→area→branch→route→rep and category→SKU; targets
   Excel import/export; run a commission plan (tiered + coverage/execution gates).
3. Scheduler: Run now on ERP Sync / Promotion Activation / Daily Digest.
4. Governance: "view as" the pilot draft → publish → rollback.

## Safety
- Everything lives under company `da000000-0000-4000-8000-000000000001`,
  RLS/scope-isolated. Not in `supabase/migrations/` → production is never seeded.
- Rotate/remove demo emails before reuse on a real tenant.
