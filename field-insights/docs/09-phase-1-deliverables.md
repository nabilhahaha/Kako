# 09 — Phase 1 Deliverables

Phase 1 (Auth, Data Model, RBAC, Configurable Intelligence) is implemented against the standalone **field-insights** Supabase project (ref `qulukfxuaklhcztchrbv`). 11 migrations applied; app builds green (typecheck + production PWA build).

## 1. Database (27 tables, applied via `supabase/migrations/0001`–`0011`)

**Foundation:** `regions`, `areas`, `profiles` (+ auth trigger), RBAC helper functions.
**Master data:** `companies`, `customers`, `locations`, `competitors`.
**Visit hub:** `visits` (+ geofence trigger, quality score), `visit_photos`, `competitor_observations`, `competitor_price_points`, `voice_notes`, `assessments`, `assessment_scores`.
**Execution graph:** `opportunities` (probability + generated `forecast_value`), `issues`, `action_plans`, `follow_ups` — each linked to the visit and cross-linked to each other.
**Intelligence history:** `customer_health_snapshots`, `customer_dev_stage_history`.
**Audit:** `audit_logs`, `framework_audit_log`.

## 2. Configurable framework metamodel (the intelligence engine)

Instead of hardcoded FMCG fields, all scoring/intelligence is data-driven:

| Table | Purpose |
|---|---|
| `frameworks` | A versioned framework of a `kind` (`assessment`, `health`, `visit_quality`, `opportunity_scoring`, `stage_model`) for an `industry` |
| `framework_dimensions` | Weighted dimensions (DVAP dimensions, health signals, quality components, opportunity factors) |
| `framework_bands` | Score bands (RAG / health status / quality tiers) with colors |
| `framework_stages` | Lifecycle stages for `stage_model` frameworks (Customer Development) |
| `framework_rules` | Threshold → action automation (e.g. Availability < 60 → spawn Issue) |

**Governance (every framework):**
- **Versioning** — `version` unique per `(key, company)`; supersede with `supersedes_id`.
- **Effective dating** — `effective_from` / `effective_to`.
- **Company overrides** — `company_id` (null = global template); `fi_resolve_framework()` prefers the company override, else global, newest effective version.
- **Audit history** — `framework_audit_log` records every insert/update/delete on all framework config tables.
- **Historical integrity** — assessments/scores **pin the framework version**, so evolving a framework never alters past results.

**Industry-agnostic:** FMCG is seeded as default (`industry='fmcg'`); other industries add their own frameworks with no code change.

## 3. Scoring engine (config-aware functions)
- `fi_recompute_assessment(id)` — weighted DVAP-style overall + band from the pinned framework.
- `fi_recompute_visit_quality(visit)` — visit completeness/quality from the `visit_quality` framework.
- `fi_recompute_customer_health(customer)` — composite health + band + snapshot from the `health` framework.
- `fi_on_visit_completed` trigger recomputes quality + health when a visit is completed.

## 4. RBAC + security
- 7 roles (`platform_admin` … `viewer`) with geographic scope (region/area) on `profiles`.
- **RLS enabled on every table**; helper functions `fi_role`, `fi_is_admin`, `fi_can_access_area`, `fi_can_see_visit` drive policies.
- Reference/config tables: read-all (authenticated), admin-write. Audit logs: admin-read.
- **Security hardening** (`0011`): views run `security_invoker` (respect RLS), functions have fixed `search_path`, trigger/recompute functions revoked from the API surface, UPDATE policies use scoped `WITH CHECK`.

## 5. Application (PWA)
- Supabase Auth (email/password), session restore, auto profile load into the session store.
- Auth-gated shell: unauthenticated → Login; authenticated → app with bottom nav.
- Typed data layer (`database.types.ts` generated from the live schema).
- Role-aware RBAC helpers (`src/lib/rbac.ts`); Customers screen reads scoped data end-to-end.

## 6. First-admin bootstrap (one-time, manual)
RLS defaults every new user to `field_user`. To create the first platform admin:
1. Create a user in the field-insights Supabase dashboard (Auth → Users → Add user), or sign up via the app.
2. Run (SQL editor on the field-insights project):
   ```sql
   update profiles set role='platform_admin' where email='you@example.com';
   ```
3. Optionally seed `regions`/`areas` assignments for managers/field users.

## 7. Verification
- 11 migrations applied successfully to `qulukfxuaklhcztchrbv`.
- `fi_resolve_framework` resolves DVAP / health / visit-quality / opportunity / stage-model defaults.
- Security advisors: SECURITY DEFINER view errors resolved; `search_path` set; RPC surface reduced.
- `npm run typecheck` and `npm run build` pass (PWA service worker + manifest emitted).

## Next (Phase 2, awaiting approval)
Visit capture flow (60-second visit), offline sync engine (Dexie queue → Supabase), DVAP capture UI driven by the configured framework, and the execution-entity quick-capture (Opportunity/Issue/Action/Follow-up) from within a visit.
