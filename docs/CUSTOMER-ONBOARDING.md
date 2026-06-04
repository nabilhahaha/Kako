# VANTORA — Customer Onboarding

> A guided migration experience on top of the Integration Hub + Import Engine, so
> a new FMCG customer can **migrate and go live in hours, not weeks**. **Additive**
> — reuses `erp_import_jobs`, `erp_import_mappings`, the entity registry and the
> Import Wizard; **no new tables, no migrations, no AI, no analytics.** Prepared
> `2026-06-04`.

## 0. Scope ↔ delivery (what existed vs. what this sprint added)

| # | Scope item | Status | Where |
| - | --- | --- | --- |
| 1 | Onboarding Wizard | **new** | `/settings/onboarding` — phased, dependency-ordered cockpit with live progress |
| 2 | Upload Center | reuse + entry | Import Wizard (`/settings/import`), reachable per entity + as a tool card |
| 3 | Entity Import Sequencing | **new** | `lib/erp/onboarding.ts` — phases × `orderEntitiesByDependency` |
| 4 | Mapping Templates | **existed** | `erp_import_mappings` + `templates-actions.ts` (surfaced, not rebuilt) |
| 5 | Saved Mapping Profiles | **existed** | same table — save / clone / share / default per entity |
| 6 | Validation Dashboard | **new** | `/settings/onboarding/validation` + `lib/erp/import-validation.ts` |
| 7 | Import History | **new screen** | `/settings/onboarding/history` over `erp_import_jobs` |
| 8 | Import Rollback View | **new** | `/settings/onboarding/rollback` + `lib/erp/import-rollback.ts` + action |
| 9 | ERPNext Connector | **new** | `lib/erp/onboarding-sources.ts` — export-column auto-mapping preset |
| 10 | Odoo Connector | **new (import)** | same — complements the existing Odoo *live-sync* adapter |

**Key finding from code inspection:** mapping templates/profiles and a live-sync
connector framework (Odoo/SAP/Dynamics/NetSuite) already existed. This sprint did
**not** duplicate them — it added the *migration* layer that ties everything into a
go-live workflow.

## 1. The "hours not weeks" levers

1. **Right order, automatically.** Onboarding is sequenced Foundation → Master Data
   → Transactions, and within each phase by the FK graph (`dependsOn`), so parents
   import before children and referential resolution succeeds first time.
2. **Auto-mapping from the old system.** The slowest manual step — matching the old
   ERP's columns to ours — is automated by source connectors that recognise
   ERPNext and Odoo export headers (§4).
3. **Map once, reuse.** Saved mapping templates (existing) mean repeat/again loads
   are one click.
4. **See and fix data quality fast.** The Validation Dashboard aggregates every
   row issue across imports into "fix-once" messages.
5. **Safe iteration.** Rollback removes a bad load entirely before go-live.

## 2. Architecture

```
/settings/onboarding (cockpit)
  ├─ buildOnboardingPlan(jobs)         [onboarding.ts]  phases × dep-order + status
  ├─ per-entity → Import Wizard (/settings/import?entity=&source=)
  ├─ Upload Center  → Import Wizard (parse → map → validate → preview → import)
  ├─ Validation Dashboard  → summarizeValidationIssues(jobs)   [import-validation.ts]
  ├─ Import History        → summarizeImportJobs(jobs)         [import-monitor.ts]
  └─ Rollback View         → buildRollbackList(jobs)           [import-rollback.ts]
                              rollbackImportJob(id)  (server action)

Source connectors: onboarding-sources.ts → autoMapHeaders() feeds the wizard's map step
Audit/state: erp_import_jobs (status, rows, error_log, import_job_id stamp)
Templates: erp_import_mappings (existing)
```
All status is **derived** from the existing `erp_import_jobs` audit (RLS-scoped);
nothing new is persisted except a rollback marker inside the existing `error_log`.

## 3. Entity import sequencing (`onboarding.ts`)

Three phases map every importable entity:
- **Foundation:** branch, region, area, warehouse, user.
- **Master Data:** customer, supplier, product, route, journey_plan.
- **Transactions:** stock, invoice_line, collection, sales_return.

`onboardingEntityKeys()` orders them with `orderEntitiesByDependency` (e.g. branch →
warehouse → stock; product → invoice_line). `buildOnboardingPlan(jobs)` attaches a
status per entity (`notStarted | inProgress | completed | failed`), rolls up rows
imported and last timestamp, and computes overall progress. The cockpit surfaces
the first not-completed step as the recommended **Next up**.

## 4. Source connectors (ERPNext & Odoo) — `onboarding-sources.ts`

A `SourcePreset` declares, per entity, the likely **source column names** for each
VANTORA field (`vantoraField → [aliases]`), covering both human export labels and
technical field names:

- **ERPNext (Frappe) Data Export:** `Item Code → code`, `Item Name → name`,
  `Standard Selling Rate → sell_price`, `Mobile No → phone`, `Email Id → email`, …
- **Odoo export:** `Internal Reference → code`, `Sales Price → sell_price`,
  `External ID → external_id`, `Name → name`, …

`autoMapHeaders(headers, fields, preset, entity)` normalises both sides
(case- and separator-insensitive) and returns confident `field → header` matches,
preset aliases first then key/label fallback. The Import Wizard gained a **Source
system** selector: pick ERPNext/Odoo before upload and columns auto-map on parse
(deep-link `?source=erpnext`). Generic falls back to the existing manual-first
behaviour. *(Distinct from the live-sync presets in `connectors/*-presets.ts`,
which map JSON-RPC/IDoc fields for ongoing sync.)*

## 5. Validation Dashboard (`import-validation.ts`)

`summarizeValidationIssues(jobs)` reads each job's `error_log`
(`{row, severity, message}`) and aggregates: total errors/warnings, jobs affected,
counts by entity (busiest first), and **top messages** — quoted values are collapsed
(`Invoice "INV-9" not found` → `Invoice "…" not found`) so the same problem groups
into one fix-once row. Rollback markers are ignored.

## 6. Import History

Full `erp_import_jobs` log (status, total/success/failed, date) with hub KPIs
(`summarizeImportJobs` + `importHealth`). Read-only, RLS-scoped.

## 7. Import Rollback (`import-rollback.ts` + action)

- **Eligibility (pure):** a job is reversible only if its target table stamps
  `import_job_id` (`entityStamps`). Master-data entities (customer/product/…)
  qualify; transactional child tables (invoice_line, collection, stock, …) do
  **not** — they're shown with a clear reason rather than risking an unscoped
  delete. Already-rolled-back and non-completed jobs are also flagged.
- **Action (`rollbackImportJob`):** permission-guarded; loads the job, re-checks
  eligibility, deletes `entity.table WHERE import_job_id = job` (RLS-scoped), and
  appends a `{ __rollback: { at, deleted } }` marker to `error_log` (the `status`
  CHECK constraint forbids a custom status, so no schema change). Idempotent — a
  rolled-back job is locked out by the marker.

## 8. Competitive grounding
- **ERPNext** Data Import: template download, dependency-ordered doctype loads,
  dry-run with error rows → matched (templates, sequencing, validate-before-import).
- **Odoo** migration: masters-before-documents, test import, external-id keys →
  matched (phase order, server re-validate, `external_id`/code matching).
- **SAP Business One** / **Dynamics 365**: staged loads + entity maps + error logs →
  matched (job audit as staging, error_log, alternate-key upsert).
- **Edge:** entity-driven (one descriptor onboards an object) + source auto-mapping
  + true rollback before go-live.

## 9. Safety / constraints honoured
- **No new tables, no migration, no production data change** at ship time (rollback
  deletes are an explicit, guarded, opt-in user action).
- **Reuse:** entity registry, permissions (`integrations.manage`), RLS, Import
  Engine, mapping templates, navigation, i18n (ar+en), shared UI components.
- **No AI, no analytics, no unrelated features.** Mobile-first, Arabic + English.

## 10. Tests
`onboarding.test.ts` (sequencing, status roll-up, progress) ·
`onboarding-sources.test.ts` (normalisation, ERPNext/Odoo auto-map) ·
`import-rollback.test.ts` (eligibility, markers) ·
`import-validation.test.ts` (aggregation, message grouping) · i18n parity +
keys-usage · `tsc` · `next build`.

*Additive; reuses the existing engine/hub/audit/templates; no new tables, no
production data change, no AI, no analytics.*
