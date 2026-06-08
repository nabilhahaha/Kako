# Phase 8G — AI Insights Layer: Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive ·
multi-tenant RLS · **highest security scrutiny** · audit-first · flag default OFF
(`KAKO_AI_INSIGHTS`).

## 1. Intent
A horizontal, **explainable** insight + Q&A layer over the existing read-models: "why did sales
drop / which customers are at risk / route underperformance / trade-spend effectiveness / forecast
explanation / collection risk". It **cites** the read-models it draws from — no opaque answers.

## 2. Reuse vs net-new
- **Reuse:** the Copilot query foundation (0135), `attribution` `explain`/traceability, the
  `commercial` forecasting/profitability engines, customer-timeline/health, ownership, and all the
  RLS-scoped read-models. The Step 2 structured-logging/redaction layer.
- **Net-new:** an insight-orchestration layer that composes these into explained insight cards +
  a grounded Q&A, plus an `erp_insight_runs` audit table. **Mostly compute over existing data.**

## 3. Data model (additive)
- `erp_insight_runs` (`company_id, user_id, kind, params jsonb, citations jsonb, created_at`) —
  an audit of every insight/question, what data it touched, and the answer's citations. Immutable
  (SELECT/INSERT-only). Company-scoped RLS.

## 4. Security & multi-tenancy (the defining concern)
- **Every** underlying query is RLS-scoped to the caller's company; the model/orchestrator gets
  **no raw cross-tenant access** — it only ever sees the caller's already-RLS-filtered read-model
  outputs. Answers must **cite** those outputs (grounding) — no free-form data invention.
- Role-based access + data-scope isolation: a user only gets insights over data they can already
  see in the UI. Prompts/outputs run through the Step 2 redaction. Every run audited
  (`erp_insight_runs`). Rate-limited; async + cached for cost/scale.
- If an external LLM is used, **only RLS-scoped, redacted, aggregated** data is sent; per-tenant
  data boundaries are contractual + technical. (Model/provider choice is an explicit review item.)

## 5. Forms / Field-Governance compatibility
Insights never surface a field/metric the user's role can't see — they read the same governed,
RLS-scoped read-models as the UI.

## 6. Mobile / Offline
Read-only **insight cards** render on mobile. Q&A is online-only (server-orchestrated). No offline
concern.

## 7. Integration
Powers PIL-D ("why" for principal gaps) and can feed dashboard widgets (8B). No new data transport.

## 8. Phasing / Risks / Non-goals
- **8G-1** explained insight cards over existing read-models + `erp_insight_runs` audit (no Q&A).
  **8G-2** grounded Q&A with citations. **8G-3** risk/anomaly insights (collection/OOS/route).
- **Risk (highest):** cross-tenant leakage / prompt-grounding → RLS-scoped inputs only, citations
  required, dedicated cross-tenant test, redaction, audit. **Risk:** hallucination → grounding +
  "no answer without citation". **Risk:** cost → async + cache. **Risk:** provider data handling →
  explicit review of model/provider + data-residency.
- **Non-goals:** not autonomous actions (insights are advisory; acting goes through workflows); not
  a data warehouse; no raw model access to the database.

**Recommendation:** proceed behind `KAKO_AI_INSIGHTS` (OFF), **engine-first** on the
grounding/citation + RLS-scoped input contract with a cross-tenant test before any UI; treat the
model/provider + data-handling as an explicit design-review decision. Highest scrutiny of any
Phase 8 item. Await approval.
