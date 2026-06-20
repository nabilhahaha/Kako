# FR-6 Completion Review — Annual & Custom Cadence

**Workstream:** Visit-Frequency Resolution Layer → FR-6 (final phase)
**Branch / PR:** `claude/pilot-ux` · commit `6d85714`
**Status:** Complete · validated · pushed — **Frequency Resolution workstream CLOSED**
**Date:** 2026-06-19

---

## 1. Supported Cadence Types

| Cadence | Canonical token | Week interval | Source |
| :--- | :--- | :--- | :--- |
| Weekly | `weekly` | 1 | enum + token |
| Multi-weekly (e.g. A-grade 3×) | `week/1/3` | 1 (spread across 3 days) | classification / customer |
| Biweekly | `biweekly` | 2 | enum + token |
| Monthly | `monthly` | 4 | enum + token |
| **Annual** | `annual` | 52 | **FR-6** |
| **Every N weeks** | `week/N/1` | N | **FR-6 custom** |
| **Every N months** | `month/N/1` | N × 4 | **FR-6 custom** |
| **Every N years** | `year/N/1` | N × 52 | **FR-6 custom** |
| Unknown | (unparseable) | — → always due | forward-compat |

Cadence is expressed as a **whole-week recurrence interval** derived from the token, so it
composes with the existing `effective_from` anchor. Weekly/biweekly/monthly map to the same
intervals as before → **fully backward-compatible**.

---

## 2. Example Scenarios

| Scenario | Token | Behaviour |
| :--- | :--- | :--- |
| Key account, 3 visits/week | `week/1/3` | Scheduled on 3 working days, due every week |
| Standard outlet, weekly | `weekly` | Due every matching day-of-week |
| Small shop, every 2 weeks | `biweekly` | Due on even weeks from anchor |
| Long-tail, monthly | `monthly` | Due every 4th week |
| Wholesale review, **annual** | `annual` | Due once every 52 weeks |
| Seasonal, **every 2 months** | `month/2/1` | Due every 8 weeks |
| Contract site, **every 3 years** | `year/3/1` | Due every 156 weeks |

---

## 3. Customer 360 Behaviour

- The Territory/Coverage card shows the **resolved frequency** with a friendly label and a
  **source badge** (Manual / Import / Planning / Classification Recommendation / System).
- FR-6 adds friendly rendering for the new cadences: **"Annual"**, **"Every 2 months"**,
  **"Every 3 years"**, **"Every 2 weeks"** (alongside the existing "3× Weekly"). Custom tokens
  no longer show raw `month/2/1` — they read in plain language.
- The classification **recommendation** still appears when it differs from the resolved value,
  unchanged.

---

## 4. Journey Plan Behaviour

- Generation/apply (FR-5) resolve the customer's effective frequency; FR-6 now **persists the
  canonical token** (`erp_journey_plans.frequency_token`) alongside the legacy enum.
- The salesman's **Today's Journey** (`erp_today_journey`) honours the token: an annual outlet
  appears on its due week only, an every-2-months outlet every 8 weeks, etc. When the token is
  null (legacy rows), the enum drives cadence exactly as before — **no behaviour change**.
- Simple Mode preserved: the generator still runs from *route + working days*; Annual is a
  one-click option in the customer form; arbitrary custom cadences arrive via **import** (or a
  future advanced control) and are never required.

---

## 5. Coverage Impact (CJ-3)

- Coverage status reuses the **same** `isVisitDueOn` cadence engine, now token-aware. The
  coverage loader passes `frequency_token` through, so **expected visits** in the 28-day window
  are computed correctly for annual/custom cadences:
  - an **annual** outlet expects ~0 visits in a 28-day window → it is **not** flagged
    under-covered for being unvisited that month (correct — it isn't due);
  - an **every-2-months** outlet expects ~0–1 and is judged against that, not a weekly baseline.
- This removes false "under-covered" noise for low-frequency outlets — coverage now reflects
  the *actual* cadence obligation. On Track / Under / Over / Never bands are unchanged.

---

## 6. Completion Review

**Implementation**
- `cadence.ts` — `weekIntervalFor` (token → interval via `parseFrequency`); `isVisitDueOn`
  token-aware with enum fallback and always-due unknowns. Pure.
- Migration `0351` — additive `frequency_token`; `erp_freq_week_interval` SQL helper mirroring
  the TS; `erp_today_journey` honours the token. No backfill, no RLS change.
- `applyJourneyProposal` — persists `frequency_token`.
- `coverage-status-server` — selects/passes `frequency_token`.
- `frequencyLabel` + i18n — friendly annual/custom labels (symmetric ar/en).

**Validation:** `tsc` clean · **1685 tests pass** (+4, 0 regressions) · `next build` compiled
(`/distribution/journey-plan`, `/distribution/coverage-customers` built).

**Authority model across surfaces:** the single resolver + token now spans **Customer 360 ·
Journey Planning · Coverage · Route Optimization · (future) Territory Intelligence Studio** —
one source of truth for "how often," from weekly through fully custom cadences.

**Backward compatibility:** every existing plan row (token null) and every tenant without
customer-level frequencies behaves exactly as before.

### FR Workstream — CLOSED
| FR-1 | FR-2 | FR-3 | FR-4 | FR-5 | FR-6 |
| :---: | :---: | :---: | :---: | :---: | :---: |
| resolver + model | storage + source | manual entry + display | Excel import | generation/apply | annual/custom |
| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Next per approved priority:** Coverage Status / Coverage Engine, then TIS shared
dataset/scenario foundations — with Simple Mode mandatory throughout.
