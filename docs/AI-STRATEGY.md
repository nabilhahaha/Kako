# Kako — AI Strategy (documentation only, no feature is built by this doc)

> Status: **strategy / proposal**. Nothing here ships a feature or touches
> production. It builds on what already exists in the repo and proposes a
> phased, mostly-free path. Prepared `2026-06-04`.
> Scope guard: the team is under a feature freeze (production-readiness focus).
> This document is the planning artefact to act on **after** the freeze lifts and
> the invoicing hotfix is applied.

---

## 0. TL;DR

Kako already has a **deterministic Help Copilot** (no external AI). The highest-
value, lowest-risk, near-zero-cost next step is to add a **natural-language layer
on top of it**: the user types a question in plain Arabic/English, an LLM maps it
to one of the **40+ existing `erp_*` RPCs** (tool-calling), and the database
returns only RLS-authorised data. The LLM never sees raw data directly — it only
*chooses a tool*. This can run on a **free LLM tier** with **no new
infrastructure** (called from the existing Vercel server actions).

---

## 1. What already exists (the foundation — reuse, don't rebuild)

| Asset | Path | Role in an AI upgrade |
| --- | --- | --- |
| Deterministic engine | `src/lib/erp/copilot/copilot-engine.ts` | Stays as the **safe fallback** + ground truth for "why blocked / what can I do". |
| Knowledge base | `src/lib/erp/copilot/copilot-kb.ts` | Becomes the **system-prompt context** + tool descriptions. |
| Live context layer | `src/lib/erp/copilot/copilot-live-context.ts` | Feeds the LLM the caller's **live** permissions/modules/rules (RLS-scoped). |
| Server actions | `src/app/(app)/copilot/actions.ts` | The **only** place the LLM is called from (server-side, key never exposed). |
| UI | `copilot-fab.tsx`, `copilot-panel.tsx` | Already mounted globally; the NL input drops straight in. |
| Analytics | `erp_copilot_queries` (migration 0135) | Already logging questions → **measure quality + confusion** from day one. |
| ~40+ `erp_*` RPCs | across `src/**` | The **tool surface** the LLM calls — each already self-guards with RLS + permissions. |

**Key insight:** the security model is already done. Every RPC enforces tenant +
permission scope server-side. So an LLM that can only *call these RPCs* inherits
that safety automatically — it cannot read anything the user couldn't already.

---

## 2. Opportunities, prioritised (value × effort)

| # | Capability | Value | Effort | Cost | When |
| --- | --- | --- | --- | --- | --- |
| 1 | **NL → tool-calling Copilot** (ask in Arabic, answer from RPCs) | ★★★★★ | Low | Free tier | Phase 1 |
| 2 | **Smart summaries** (daily rep/manager digest, variance explanations) | ★★★★ | Low | Free tier | Phase 1–2 |
| 3 | **Data-entry assist** (auto-categorise products/customers, dedupe) | ★★★★ | Med | Free/cheap | Phase 2 |
| 4 | **Anomaly hints** (unusual invoices/collections) — LLM *explains*, rules *detect* | ★★★ | Med | Free | Phase 2 |
| 5 | **Invoice/receipt OCR → structured entry** | ★★★ | High | Cheap (vision) | Phase 3 |
| 6 | **Route / replenishment suggestions in natural language** | ★★★ | High | Cheap | Phase 3 |

Start at #1: it reuses everything in §1 and proves the architecture end-to-end.

---

## 3. Reference architecture (safe LLM-over-RPC)

```
User (Arabic/English, free text)
        │
        ▼
copilot/actions.ts  (server action — secret key stays here)
        │  1. build context from copilot-live-context.ts (caller's live perms/modules)
        │  2. send: system prompt (copilot-kb.ts) + tool schemas (subset of erp_* RPCs)
        ▼
   LLM (free tier)  ──►  returns a TOOL CALL, e.g. erp_sales_summary({...})
        │                 (the model proposes; it does NOT see data)
        ▼
Supabase RPC  ──►  executes under the caller's session → RLS + permission guards
        │            returns ONLY authorised rows
        ▼
   LLM formats the authorised result into a sentence  ──►  user
        │
        └──►  log to erp_copilot_queries (quality + confusion analytics)
```

**Guardrails baked in:**
- LLM output is constrained to **tool calls** (function-calling), not free SQL.
- Tools = a **curated allowlist** of read-mostly RPCs; no destructive tools in Phase 1.
- Every call runs **as the user** → RLS does the authorisation, not the LLM.
- **Deterministic fallback:** if the model is unsure / tier is rate-limited, fall
  back to today's `copilot-engine.ts` answer. Never worse than today.
- **Feature-flagged + off by default** so it can't regress the frozen app.

---

## 4. "Free" — concretely

| Option | Cost | Best for | Trade-off |
| --- | --- | --- | --- |
| **Keep deterministic engine** | $0 | "why blocked / next action" | No free-text understanding |
| **Groq free tier** (Llama-3.x) | $0 (rate-limited) | Fast NL + tool-calling at your current volume | Quotas; quality below frontier |
| **Google Gemini free tier** | $0 (rate-limited) | NL, summaries, basic vision (OCR) | Quotas; data-handling policy review |
| **Self-host small model** (Ollama on a worker) | $0 infra-reuse | Summaries/classification | You manage the runtime |
| **Claude / OpenAI API** | Paid, cheap w/ prompt caching | Best multi-step tool-calling + Arabic quality | Per-token cost (small at your scale) |

**Infrastructure cost: $0 extra.** It's an outbound API call from a server action
you already run on Vercel; storage/analytics already exist (`erp_copilot_queries`).
Recommendation: **start on a free tier (Groq/Gemini)** for Phase 1; keep a paid
provider as a config-swap if quality demands it. Provider is an env var, not a
rewrite.

---

## 5. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Data leakage** | LLM only selects tools; data comes from RLS-scoped RPCs as the user. No raw table access, no service-role key in the prompt path. |
| **Prompt injection** (malicious customer/product text in data) | Treat all DB text as untrusted; never let tool *results* re-issue tools; tool allowlist is fixed server-side, not model-chosen. |
| **Hallucination** | Answers are grounded in actual RPC results; if no tool matches, fall back to deterministic engine or "I don't know". |
| **Cost runaway** | Free tier + per-company rate limit + prompt caching; log token use in analytics. |
| **Free-tier quotas / outages** | Deterministic fallback keeps the Copilot functional; provider is swappable via env. |
| **Privacy / compliance** | Review provider data-retention terms before sending tenant data; offer a self-host path for sensitive tenants. |
| **Arabic quality** | Evaluate models on a small Arabic question set (use `erp_copilot_queries` history) before rollout. |

---

## 6. Phased rollout

**Phase 0 — prerequisites (not AI):** apply the invoicing hotfix; lift the freeze.

**Phase 1 — NL Copilot on ONE screen (flagged, off by default):**
- Wrap 5–8 read-only RPCs as tools (e.g. `erp_sales_summary`, `erp_today_journey`,
  `erp_search_products`).
- Free tier; deterministic fallback; log everything.
- Success = "can a manager ask a sales question in Arabic and get a correct,
  RLS-correct answer?"

**Phase 2 — broaden:** more tools, daily summaries, data-entry assist, anomaly
explanations. Evaluate paid vs free on measured quality.

**Phase 3 — heavier:** OCR intake, route/replenishment NL planning.

Each phase ships behind a flag, measured against §7 before widening.

---

## 7. Success metrics (already loggable via `erp_copilot_queries`)

- **Answer-resolution rate** (did the user stop asking / take the suggested action?).
- **Tool-call accuracy** (right RPC for the question) — sampled review.
- **Fallback rate** (how often the deterministic engine had to catch the LLM).
- **Latency** and **tokens/cost per answer**.
- **Confusion hotspots** (which screens generate the most questions → UX fixes).

---

## 8. Decision points for the team

1. **Provider for Phase 1:** Groq vs Gemini free tier (recommend whichever passes
   the Arabic eval). Env-swappable either way.
2. **Self-host option** for privacy-sensitive tenants: yes/no.
3. **Scope of the first prototype:** which single screen + which 5–8 RPCs.
4. **When:** strictly after the invoicing hotfix + freeze lift.

> This is a plan, not an implementation. No feature, model call, or production
> change is introduced by this document.
