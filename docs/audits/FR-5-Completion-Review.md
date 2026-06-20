# FR-5 Completion Review — Journey Generation & Apply Consume the Frequency Resolver

**Workstream:** Visit-Frequency Resolution Layer → FR-5
**Branch / PR:** `claude/pilot-ux` · commit `b36bf1e`
**Status:** Complete · validated · pushed
**Date:** 2026-06-19

---

## 1. Objective

Make customer-level visit frequency the **authority for journey generation**, with
classification (A/B/C) demoted to a recommendation/fallback. This is the first FR phase that
changes **live generation behaviour** — done behaviour-preservingly for tenants that have not
set customer-level values.

---

## 2. What Changed

| Area | Change |
| :--- | :--- |
| `generator.ts` | `GenCustomer` gains optional pre-resolved `visitsPerWeek`. When set it overrides the classification rule; when absent it falls back to the rule (today's behaviour). Pure. |
| `customer-frequency.ts` | `resolveFrequencyForCustomer` — shared pure bridge (customer columns + grade code + company rules + override policy → `ResolvedFrequency`) so **generate and apply schedule by the same precedence**. |
| `journey-plan/actions.ts` | `generateJourneyProposal` + `applyJourneyProposal` resolve frequency per customer (customer-level wins; company override flag respected). The persisted `erp_journey_plans.frequency` is written from the **resolved** cadence, not raw classification. Proposal reports `customerLevelCount`. |
| Wizard | New **"From customer profile: N"** badge — Simple-Mode transparency showing where the cadence came from, without exposing any settings. (i18n `journeyPlan.fromCustomer`, symmetric ar/en.) |

---

## 3. Behaviour Change — the inversion is now complete

| Customer state | Before FR-5 | After FR-5 |
| :--- | :--- | :--- |
| Has `visit_frequency` (manual / import) | Ignored — classification used | **Honoured** — drives schedule + persisted plan |
| No `visit_frequency`, has A/B/C grade | Classification used | Classification used (unchanged) |
| Company sets override flag | n/a | Classification supersedes customer-level (opt-in) |
| Neither value | 1/week fallback | Skipped when no resolved frequency (cleaner) |

**Behaviour preserved** for every tenant that has not set customer-level frequencies (the
default state after FR-2's no-backfill migration) — generation is identical to before.

---

## 4. Precedence (unchanged contract, now enforced end-to-end)

```
1. Customer-level frequency (manual | import)   ← primary authority
2. Route / planning assignment                  (reserved; activates with planning UI)
3. Classification recommendation (A/B/C)        ← fallback / auto-fill
4. System default
   + company override flag may let #3 supersede #1 (opt-in)
```

The same resolver now feeds: the **preview** (visits/week → day spread), the **persisted plan**
(`frequency` enum), and — via FR-1…FR-3 — the **Customer 360 display** and **cadence/coverage**
engines (CJ-2/CJ-3). One authority, every surface.

---

## 5. Simple Mode Alignment

- Zero-configuration happy path unchanged: **pick route + working days → Generate → Preview →
  Apply.**
- Per-customer frequencies (entered or imported) are honoured **silently** — no new controls.
- The wizard states, in plain language, how many stops came **From customer profile** vs the
  classification recommendation — transparency without technical settings.

---

## 6. Validation

| Check | Result |
| :--- | :--- |
| `tsc --noEmit` | Clean |
| `vitest` (full) | **1681 passed** / 192 skipped · 0 regressions (+12 new) |
| `next build` | Compiled successfully · `/distribution/journey-plan` built |

New tests: `resolveFrequencyForCustomer` (grade fill · customer override · null · company
override) and `generator` `visitsPerWeek` override (fallback · override down · override up ·
skip).

---

## 7. FR Workstream Status

| Phase | Scope | Status |
| :--- | :--- | :--- |
| FR-1 | Resolver + value model | ✅ |
| FR-2 | Additive storage + source tracking | ✅ |
| FR-3 | Governed manual entry + Customer 360 display | ✅ |
| FR-4 | Excel import + `source='import'` | ✅ |
| **FR-5** | **Generation + apply consume the resolver** | ✅ |
| FR-6 | Annual / custom cadence (extend `isVisitDueOn` + richer plan-row frequency) | ⏳ forward-looking |

---

## 8. Recommended Next Step

**FR-6** to fully close the FR workstream (weekly/biweekly/monthly are fully working today;
FR-6 adds annual/custom cadence end-to-end). Per the approved priority order — finish FR, then
Coverage, then TIS foundations — FR-6 is the last FR item before the Coverage workstream.
Awaiting go-ahead.
