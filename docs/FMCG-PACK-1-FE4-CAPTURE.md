# FE-4 — In-visit Builder Capture · Architecture & Scope

Status: **proposal (pre-implementation)**. Builds on the Builder (forms, effects
incl. `emit_fact`, `subject_ref`, `entity_ref`), the visit spine (FE-2) and the
raw-fact bus / coverage seams (FE-3). Additive, multi-tenant (RLS), under
`field_ops`. No rewrites.

---

## 1. Concept

In-field data capture (merchandising, competitor, surveys, OOS, opportunities,
quick forms) is **Builder forms** the rep fills *in the visit context*. Each
capture form carries an **`emit_fact`** effect, so submitting it pushes a raw
fact for analytics — no per-form code. A thin **`erp_fe_captures`** link ties the
submission to its visit + customer and holds an optional **execution score**, the
anchor for FE-5 dashboards and scoring.

```
Visit (in-progress) ─ rep opens a capture form (customer preset)
   └─ Builder FormFill → submitFieldCapture
        ├─ erp_form_submissions (Builder)         ← validated, audited
        ├─ effect emit_fact → erp_raw_emit('field_ops','fe_*',{measures})  ← analytics
        └─ erp_fe_captures(visit_id, customer_id, form_id, submission_id, kind, score)
```

### New entity
| Table | Purpose |
|---|---|
| `erp_fe_captures` | `(company, visit_id?, customer_id, form_id, submission_id, kind, score?, created_by)` — links a Builder submission to its visit/customer; `kind ∈ merchandising\|competitor\|survey\|out_of_stock\|opportunity\|quick`; `score` is the scoring anchor. RLS: rep writes own; field_ops:view sees team. |

Everything else reuses existing tables (`erp_form_*`, `erp_fe_visits`, `erp_raw_facts`).

### New server action
- `submitFieldCapture({ formId, customerId, visitId?, kind, values }, photo?)` —
  reuses the Builder submit (validate → submission → effect, incl. `emit_fact`),
  then records the `erp_fe_captures` row (with `score` from a designated field).
  The customer is preset (visit subject); `subject_ref = record` so `emit_fact`
  attributes the fact to the customer.

### Seeded global Builder templates (configuration, clone-to-use)
| Key | Fields (sample) | Effect → fact |
|---|---|---|
| `fe_merchandising_audit` | shelf_share, facings, planogram_compliant, shelf_price, photo | `emit_fact fe_merchandising` (amount=price, quantity=facings, shelf_share, compliant) |
| `fe_competitor_capture` | competitor, product, price, promo, photo | `emit_fact fe_competitor` (amount=price, …) |
| `fe_store_checklist` | checklist items + score | `emit_fact fe_survey` (quantity=score) |
| `fe_out_of_stock` | product (entity_ref), severity | `emit_fact fe_out_of_stock` |
| `fe_opportunity` | type, value, note | `emit_fact fe_opportunity` (amount=value) |
| `fe_quick_complaint` / `fmcg_new_customer` | note / customer fields | record / `create_customer` |

All use `subject_ref = {source:record}` (customer from the visit) + `emit_fact`,
so **raw-fact emission for every capture** is automatic.

---

## 2. Item-by-item

| # | Item | Mechanism |
|---|---|---|
| 1 | **Merchandising execution** | `fe_merchandising_audit` form + `emit_fact fe_merchandising` + capture(kind=merchandising) |
| 2 | **Competitor monitoring** | `fe_competitor_capture` + `emit_fact fe_competitor` (already alerts via FE-2e) |
| 3 | **Surveys & checklists** | Builder forms (any field types) + `emit_fact fe_survey` |
| 4 | **Quick capture forms** | Builder forms (new-customer/complaint) launched in/out of visit |
| 5 | **Out-of-stock reporting** | `fe_out_of_stock` form (entity_ref product) + `emit_fact fe_out_of_stock` |
| 6 | **Customer opportunities** | `fe_opportunity` form + `emit_fact fe_opportunity` (amount=value) |
| 7 | **Execution scoring readiness** | `erp_fe_captures.score` + `erp_fe_visit_score(visit)` aggregate (compliance + survey + …); weighting tuned in FE-5 |
| 8 | **Full Builder integration** | reuses forms/effects/subject_ref/entity_ref + `submitFieldCapture`; no bespoke capture code |
| 9 | **Raw fact emission for all captures** | every template carries `emit_fact` → `erp_raw_emit('field_ops', fe_*)` |
| 10 | **Dashboard readiness for FE-5** | captures + `fe_*` facts + `erp_fe_visit_score` are the read seam; Customer 360 gains merch-compliance / survey-score / open-opportunities |

---

## 3. UI
- **Rep (in-visit):** a **Capture launcher** on the route/visit screen listing the
  active `field_ops` capture forms; tapping opens the Builder runtime fill
  (customer preset), submit → `submitFieldCapture`. Captures appear on the visit
  and on the customer field profile timeline.
- **Reuse:** `FormFill` (B5 runtime) gains an injectable `submit` so the same
  renderer powers generic forms and field captures.

## 4. Proposed sub-steps (each: build → test → checkpoint)
- **FE-4a Data + Builder wiring:** `erp_fe_captures`, `submitFieldCapture`, seed
  the 6 global capture templates (with `emit_fact`). Tests (capture row + fact).
- **FE-4b Rep capture UI:** in-visit launcher + `FormFill` reuse; captures on
  visit + profile timeline.
- **FE-4c Scoring + 360:** `erp_fe_visit_score` + capture rollups (merch
  compliance, survey score, open opportunities) on Customer 360.
- **FE-4d Dashboard readiness:** execution-summary seam (`erp_fe_execution_summary`)
  for FE-5 + raw-fact measure conventions documented.

## 5. Open decisions (need your call before FE-4a)
1. **Capture link** — dedicated **`erp_fe_captures`** table (recommended; keeps
   field concerns out of the generic forms table, holds `score`) vs. a
   `visit_id` column on `erp_form_submissions`?
2. **Templates** — ship the **6 global FMCG capture templates** (recommended;
   instant value, clone-to-customize) vs. company-built only?
3. **Scoring now** — **simple field-based score** + a `visit_score` aggregate
   (recommended) vs. a full weighted scoring engine now (defer to FE-5)?
4. **OOS / opportunities** — as **Builder forms** (recommended; configurable,
   raw-fact-driven) vs. dedicated tables?

## 6. Non-goals (FE-4)
Promotions/contracts execution, planogram image recognition, order capture &
pricing (sales pack), survey logic branching beyond the existing rules engine,
the FE-5 dashboards themselves (FE-4 only readies their data).
