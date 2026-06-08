# Phase 8F — Form Builder: Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive ·
multi-tenant RLS · governance + audit · flag default OFF (`KAKO_FORM_BUILDER`).

## 1. Architecture & intent
A no-code **form designer** that composes the existing dynamic-field primitives into reusable,
versioned forms attachable to entities and workflow steps. The platform already has
**custom fields** (`erp_custom_fields`, 0087), **field governance** (0114), **surveys** (0144,
with a question/answer + scoring model), **attachments** (0111), and **GPS** (0131). 8F unifies
these into a *form definition* with layout, validation, and conditional visibility.

## 2. Reuse vs net-new
- **Reuse:** custom-field types + storage, the survey question/answer + scoring engine (already a
  proven dynamic-form pattern), field-governance resolution, attachments (file/photo questions),
  GPS capture (location questions), and the Step 1 offline media pipeline for photo questions.
- **Net-new:** a `form definition` (sections, ordered fields, conditional show/hide, validation
  rules) + versioning + a renderer that drives both web and the mobile field client.

## 3. Data model (additive)
- `erp_forms` (`company_id, code, name, name_ar, entity?, is_active`), `erp_form_versions`
  (`form_id, version, schema jsonb, published_at`) — draft→publish like the workflow engine.
  Responses reuse the survey-response pattern (`erp_survey_responses`) or a parallel
  `erp_form_responses` (`form_id, version, entity, record_id, answers jsonb, score?, created_by`).
  Company-scoped RLS; FK-covering indexes; immutable responses.

## 4. Field-Governance compatibility (core requirement)
A form **cannot** expose or write a field the acting role isn't permitted to see/edit — the
renderer resolves visibility/editability through the **same** field-governance layer (0114) used
elsewhere. No form-specific bypass. Governance changes propagate to forms automatically.

## 5. Mobile / Offline
First-class: forms render on the mobile field client; the **offline survey + media pipelines from
Step 1** are reused directly (a form submitted offline queues as a `survey`/`form` mutation,
scored/inserted server-side on sync; photo questions ride the offline-media store). This is the
main reason 8F sequences after Step 1.

## 6. Audit / Security / Multi-tenant
Form authoring (create/edit/publish) and responses audited. Company-scoped RLS; global form
templates platform-owned + cloned-on-use. Validation is declarative (no code execution).

## 7. Integration
Forms bind to entities (custom-field host) and to **workflow steps** (8A references a form id on a
`task`/`data-update` step) — the two builders compose without coupling. Responses are exportable
via the raw-data export (feeds 8C).

## 8. Phasing / Risks / Non-goals
- **8F-1** form definition + versioning + renderer over custom fields (reuse survey scoring).
  **8F-2** conditional logic + validation + governance-aware rendering. **8F-3** mobile + offline
  submission (reuse Step 1 pipelines) + attachments/GPS questions.
- **Risk:** divergence from the survey engine → unify on one response/scoring model, don't fork.
  **Risk:** governance bypass → single resolution path (hard requirement).
- **Non-goals:** not a public/anonymous form host; not a workflow engine (8A); no code execution.

**Recommendation:** proceed behind `KAKO_FORM_BUILDER` (OFF); high reuse (custom fields + survey
engine + governance + offline pipelines). Sequence after 8A/8E so workflow steps + notifications
can reference forms. Await approval.
