# Phase 7 — Unified Entity 360 Platform (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_ENTITY360`, default OFF) ·
multi-tenant safe · audit-first · reuse-first. The approved **unified 360 platform**
(منصّة 360 موحّدة): one engine + a profile registry for **any** entity — adding a new
360 is registering a profile, **not** building a bespoke page.

## Pure engine (`src/lib/entity360/`, 5 unit tests)
| Module | Capability |
|---|---|
| `registry.ts` | 10 built-in 360 profiles — **Customer / SKU / Category / Brand / Salesman / Supervisor / Area Manager / Region / Route / Promotion** — each declaring panels sourced from existing read-models (no new logic) |
| `build.ts` | `build360(entity, id, roles, sectionRules)` assembles the profile's panels filtered by **role section security** (REUSES role-governance `visibleSections`, 0227); exports honor the same filter |

## Schema (additive, RLS, immutable, FK-covering)
- **0228 `erp_entity_timeline`** — **generic** immutable append-only event index (entity_type + entity_id) generalizing the customer timeline (0216) to every entity type — no redesign per new 360. Immutable via RLS (SELECT + INSERT only). References related records (no duplication).

## Reuse (not rebuilt — this is the whole point)
Each panel sources an **existing** read-model: customer-timeline/health, distribution-kpi, perfect-store,
coverage/scorecard, route-riding analytics, route-optimization analytics, attribution, trade-spend ROI/claims,
commercial pricing/profitability/forecasting/targets, ownership history. Section security reuses
**role-governance** (0227); ownership history reuses **`@/lib/ownership`** (0214).

## Requirement coverage (the approved 360 platform)
SKU 360 · Category 360 · Salesman 360 · Area Manager 360 + Customer/Supervisor/Region/Route/Promotion/Brand
360 — all via **one** registry + engine ✓ · each role sees only permitted sections (Entity-360 security) ✓ ·
generic entity timeline (any entity, immutable) ✓ · attribution to owner-at-execution via ownership ledger ✓ ·
multi-tenant + role governance + reuse-first ✓.

## Validation
Typecheck 0 · build 0 · **1102 unit tests** (+5) · integration: entity-timeline-schema (2, incl. immutability)
+ schema-health FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin increments)
A generic `/360/[entity]/[id]` page rendering `build360()` panels; per-panel data loaders wrapping the
existing read-models; event emitters writing `erp_entity_timeline`; company-extensible profiles.
