# Copilot AI — V1 architecture, security model & rollout

> **Isolated, flag-gated prototype. AI is OFF by default.** This documents the
> implementation on branch `claude/copilot-ai-v1`. It adds an *optional* natural-
> language layer over the existing deterministic Help Copilot, with no paid AI
> dependency. Prepared `2026-06-04`.

---

## 1. Goal & guarantees

Let a user type a free-text question (Arabic or English) on the **Ask Copilot**
screen and get an answer — while guaranteeing:

- The deterministic Copilot remains the **core**; AI is an optional layer.
- **Feature flag `COPILOT_AI_ENABLED` = OFF by default.**
- If AI fails (throws or is unsure) → **fallback to deterministic**.
- The **AI layer never reads the database**. It only maps a question to an
  *intent* that points at an existing, already-authorized capability.
- Answers respect **RLS, tenant scope, role permissions, and the current user**.

---

## 2. Components

| Module | Responsibility | DB access |
| --- | --- | --- |
| `src/lib/copilot/ai/flags.ts` | `COPILOT_AI_ENABLED` flag (pure `parseFlag` + reader). Default OFF. | none |
| `src/lib/copilot/ai/catalog.ts` | Builds a searchable intent catalog from the existing KB (actions, screens, training, permissions). Pure metadata. | none |
| `src/lib/copilot/ai/intent.ts` | **Deterministic interpreter** — maps a question → intent via token scoring + trigger words (AR/EN). The default, free, no-LLM provider. | none |
| `src/lib/copilot/ai/provider.ts` | Provider abstraction + `resolveIntent` (flag check, LLM-optional, safe fallback). | none |
| `src/lib/copilot/ai/resolve.ts` | Routes an intent to an answer using the **existing deterministic engine**. | none |
| `src/app/(app)/copilot/ai-actions.ts` | Server action `askCopilot` — the **only** DB toucher: RLS-scoped facts + audit log. | RLS-scoped client only |
| `src/components/copilot/ask-copilot.tsx` + `copilot/ask/page.tsx` | The Ask Copilot screen (AR/EN). | via the action |
| `supabase/migrations/0144_copilot_ai_audit.sql` | Adds `ai_ask` type + provenance columns + `erp_log_copilot_ai`. Additive. | — |

### Flow

```
question ─► askCopilot (server action)
              │  buildCatalog() + caller's permission snapshot (no DB)
              ▼
          resolveIntent(flag, provider)         ── pure, no DB
              │  • flag OFF or no LLM → deterministic interpreter
              │  • flag ON + LLM      → try LLM, fall back on throw/low-confidence
              ▼  Intent { kind, key }
          resolveAnswer(intent, callerContext)  ── existing deterministic engine
              │  (why-blocked / screen / training / permission)
              │  optional: caller's OWN RLS-scoped facts (e.g. day-close coverage)
              ▼
          audit log (erp_log_copilot_ai, fire-and-forget) ─► answer to UI
```

---

## 3. Security model

- **No DB handle in the AI layer.** `CopilotAiProvider.interpret` accepts only
  `{ question, locale, catalog, context }` — never a Supabase client. A unit
  test (`no-db.test.ts`) scans every `ai/*.ts` module and fails if it imports a
  DB client, `createClient`, `.from('erp_…')`, or `.rpc(`.
- **Authorization is unchanged.** The answer is computed by the same engine the
  rest of the Copilot uses, over the caller's **own** `UserContext`
  (permissions/modules/role). A user without a permission gets a "blocked"
  answer with a remedy — never another tenant's data.
- **RLS-scoped facts only.** Any data enrichment (e.g. day-close coverage) runs
  through the caller's session client and is pinned to their own rows — mirroring
  the existing deterministic actions.
- **Audit logging is metadata-only.** `erp_log_copilot_ai` stores the resolved
  action key, locale, provider, fallback flag and blocked flag — **no question
  text, no PII** — and is company-scoped via `erp_user_company_id()` with the
  existing RLS read policy (admins/owner only). Logging is fire-and-forget.
- **Tenant isolation tested.** `copilot-ai.test.ts` proves one company's admin
  cannot read another company's copilot queries.

---

## 4. Free vs paid provider roadmap

V1 ships **only** the deterministic provider (free, local, no network). The
provider abstraction lets an LLM be added later **without touching call sites**:

| Stage | Provider | Cost | Notes |
| --- | --- | --- | --- |
| **V1 (now)** | Deterministic interpreter | $0 | Token/keyword matching over the KB. No external dependency. |
| V2 (opt-in) | Free-tier LLM (e.g. Groq / Gemini free) | $0 within quota | `registerLlmProvider(...)`; flag ON; deterministic fallback stays. |
| V2 (self-host) | Local small model | $0 infra-reuse | For privacy-sensitive tenants. |
| V3 (optional) | Paid API (Claude/OpenAI) with prompt caching | low | Only if measured quality requires it; env-swappable. |

**No paid keys are integrated in V1.** Adding one is a registration call + env
var, not a rewrite. An LLM provider must implement the same `interpret` contract
(question → intent) and therefore also cannot read the DB.

---

## 5. Rollout plan

1. **Now:** merge behind the flag (OFF). Deterministic Ask Copilot is live and
   safe; no behavior change for anyone until the flag is set.
2. **Internal eval:** turn `COPILOT_AI_ENABLED=true` in a preview with a free-tier
   LLM provider registered; evaluate Arabic/English intent accuracy against the
   `erp_copilot_queries` log; deterministic fallback guarantees "never worse".
3. **Gradual enablement:** per-environment (and later per-company) once accuracy
   and latency meet bar.
4. **Expand scope (future):** wire additional read-only RPCs as tools for
   data questions (summaries, etc.) — each still RLS-scoped, still no direct DB
   access by the model. Tracked separately from this prototype.

Sequencing note: this track stays parked behind the flag until **production
invoicing is restored and stable** (per the production-readiness plan).

---

## 6. Tests (proving the rules)

| Test | Proves |
| --- | --- |
| `flags.test.ts` | Flag defaults OFF; only `"true"` enables. |
| `intent.test.ts` | AR/EN interpretation; **permission-aware** answers (blocked vs allowed); unknown → suggestions. |
| `provider.test.ts` | **Flag OFF never calls the LLM**; **fallback** on throw / low-confidence; LLM used only when enabled + confident. |
| `no-db.test.ts` | **No direct DB access** by any AI-layer module (source scan). |
| `copilot-ai.test.ts` (DB) | Audit row written & company-scoped; **no cross-tenant** read. |

*Documentation for an isolated, flag-OFF prototype. No production change and no
paid AI dependency are introduced.*
