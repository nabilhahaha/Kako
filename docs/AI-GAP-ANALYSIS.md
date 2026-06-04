# VANTORA — AI Gap Analysis & Insights Foundation

> Deterministic, high-ROI AI **foundations** — no LLM, no migration, no new
> infrastructure, reuse existing RLS data, **feature-flagged OFF**
> (`VANTORA_INSIGHTS_ENABLED`). No generic chat, no autonomous agents, no
> DB-writing AI. Prepared `2026-06-04`.

## Sources reviewed (patterns, not code)
Open WebUI, LibreChat, Langflow, Flowise, CrewAI (chat/agent orchestration — **explicitly avoided**); ERPNext AI, Odoo AI modules, Salesforce **Einstein** (predictive/next-best-action), HubSpot AI (deal/lead insights), Notion AI (summarize/explain), Linear AI (issue triage). **Takeaway:** the durable value is **explainability + recommendation over the user's own data** (Einstein/HubSpot-style), not chatbots.

## Capability gap matrix
✅ has · ◻ partial · ❌ missing → **action**

| # | Capability | State | This sprint |
| --- | --- | --- | --- |
| 1 | **Sales Intelligence** (explain KPI change, anomalies) | ◻ partial (KPIs shown) | ✅ **Built** — `kpiDeltaInsight`, `anomalyInsights` |
| 2 | **Field Execution Intelligence** | ✅ (Visit Coaching `coaching.ts`) | reuse |
| 3 | **Route Optimization Intelligence** | ✅ (journey sort engine) | reuse |
| 4 | **Coverage Intelligence** (explain drop) | ◻ partial (territory grid) | ✅ **Built** — `coverageDropInsight` |
| 5 | **Lost Customer Intelligence** ("why declining?") | ❌ missing | ✅ **Built** — `customerDeclineInsight` |
| 6 | **Trade Spend Intelligence** | ❌ missing (no trade-spend data) | ⛔ **Deferred** — needs a data model (future module) |
| 7 | **Forecasting Intelligence** | ❌ missing | ✅ **Built** — `runRateForecast` / `forecastInsight` |
| 8 | **Coaching Intelligence** | ✅ (`coaching.ts`) | reuse |
| 9 | **Exception Detection** | ◻ partial (Attention Center) | ✅ **Built** — `anomalyInsights` (statistical) |
| 10 | **Executive Insights** (explain/next-best) | ◻ partial (Manager Home) | ✅ **Built** — ranked insight feed + Insights screen |

## What was implemented (deterministic, flag-OFF)
- **`src/lib/erp/insights/engine.ts`** (+ tests): pure intelligence —
  `classifyTrend`, `kpiDeltaInsight`, `customerDeclineInsight`,
  `opportunityInsight`, `coverageDropInsight`, `anomalyInsights`,
  `runRateForecast`/`forecastInsight`, `rankInsights`. Bilingual.
- **`src/lib/erp/insights/flags.ts`** (+ tests): `VANTORA_INSIGHTS_ENABLED`, OFF by default.
- **`/insights`** screen + `companyInsights` server action — gathers RLS-scoped
  sales history + per-customer order trends and renders ranked, explainable
  insights ("Sales down 18% vs last period", "Customer X stopped ordering",
  "Projected 300 vs target 250", upsell opportunities). **Flag-gated**: shows a
  disabled state until enabled.
- Nav entry (permission-gated `reports.view`) + bilingual i18n.

**Answers it produces today** (deterministic): *Why is this customer declining? · Explain the KPI change · Which customers need attention · Opportunity detection · Forecast vs target · Unusual drop/spike (exception).*

## What was deferred (with reason)
- **Trade Spend Intelligence** — no trade-spend/promotions data model exists; would need new tables (out of scope: no migrations). Future module.
- **LLM natural-language Q&A** — the parked Copilot AI V1 (flag-OFF) covers this path separately; not enabled here (no infra/keys).
- **Predictive ML (churn probability, demand)** — would need a model/infra; the deterministic trend/forecast heuristics are the high-ROI foundation first.

## Safety & constraints honored
No migration · no schema/tables · no production change · no new dependency · no LLM · reuses existing RLS data · **flag OFF by default** · reads-only (defensive; degrades on drift) · not chat/agents/DB-writers.

## Estimated platform value increase
**High.** Explainable "why/what-next" intelligence over the user's own data is the Einstein/HubSpot-class differentiator OSS ERPs lack — delivered as a zero-risk, zero-cost deterministic foundation that an LLM layer can later enrich.
