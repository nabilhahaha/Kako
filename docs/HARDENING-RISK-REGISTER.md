# Hardening & Hidden-Risk Register

*Feature freeze in effect — focus: stability, scalability, security, pilot execution, operational excellence. Continued risk hunt with fresh code-grounded checks. No new features/modules/roadmap. Review-first.*

Class: **🔴 Before Pilot · 🟠 Before First Paying Customer · 🟢 Can Wait.**

---

## Investigated this round → CLEARED (de-risked, with evidence)
- ✅ **RLS coverage complete** — queried the migrated DB: **0 `erp_` tables with `rowsecurity=false`**. Earlier grep was a false alarm (tables enable RLS via loop/`EXECUTE`). No tenant-isolation hole.
- ✅ **Document numbering is concurrency-safe** — `erp_next_number` uses atomic `INSERT … ON CONFLICT DO UPDATE SET current_val = current_val + 1 RETURNING` (row-locked); **no duplicate invoice/order numbers under concurrency**. (Gaps possible on rollback — normal for doc numbers.)
- ✅ **No app-side DB connection pool to exhaust** — runtime uses `@supabase/ssr` → **PostgREST (HTTP)**; Supabase's PostgREST/Supavisor handles pooling. Direct `*_DATABASE_URL` is used **only** by the migration CI job, not the app. Avoids the classic serverless-Postgres connection problem.
- ✅ **SECURITY DEFINER fns set `search_path`**; **`service_role` confined to a server-only lib**; new-stack write policies restricted to admin/platform-owner (prior review).

## Stability
| # | Risk | Sev | Evidence / impact | Action | Class |
|---|---|:--:|---|---|---|
| ST1 | **Mutation double-submit / non-idempotent retries** — create-order/invoice/**payment** server actions have no idempotency key; a double-click or network retry could duplicate a financial record | Med | UI disables on submit (mitigates clicks); network retries not covered | Keep disable-on-submit; add an **idempotency key** for payments/invoices | 🟠 |
| ST2 | **Publish/rollback not atomic** (R1) — 3-step archive→insert | Low | resolver falls back published→live→registry, so no breakage | wrap in a transactional RPC | 🟠 |
| ST3 | **Money math in JS float** for display + credit pre-check | Low | authoritative math is SQL/`numeric` (issue/payment RPCs); JS only display + a by-the-cent pre-check | round consistently; optionally do credit pre-check in SQL | 🟢 |

## Scalability
| # | Risk | Sev | Evidence / impact | Action | Class |
|---|---|:--:|---|---|---|
| SC1 | **`count: exact`** cost grows linearly | Med | measured ~21 ms @100k → ~200 ms @1M | switch to **`planned`** >100k (`recommendedCountMode` ready) | 🟠 |
| SC2 | **Leading-wildcard `ilike` search** scans within tenant | Med | ~16 ms @100k; worse at 1M | **`pg_trgm` GIN** + Arabic normalization | 🟠 (before large tenants) |
| SC3 | **Scoped-role RLS evaluated row-by-row** (DB review's main bottleneck) | Med | `erp_customer_in_scope` per row on customers/invoices for scoped reps | index-friendly `salesman_id` path + app filter | 🟠 |
| SC4 | **Dashboard full-table scans** (`balance`/stock aggregates) | Med | live aggregates, no active-only filter | active-only filters + pre-computed report summaries | 🟠 |
| SC5 | **Append-only tables grow unbounded** (`erp_audit_logs`, `erp_notifications`, completed `erp_workflow_tasks`) | Med | no retention | scheduled retention/archive jobs | 🟠 |
| SC6 | **Supabase tier / PostgREST-pooler capacity** vs concurrency (500-user target) | Med | architecture is fine; capacity is a plan/tier setting | size the Supabase plan/pooler to expected concurrency; watch in load test | 🟠 (verify before scaling) |
| SC7 | **Deep-offset pagination** | Low | ~37 ms at offset 100k; users rarely go deep | keyset pagination | 🟢 |
| SC8 | **Partitioning / read-replica / cold-tenant archiving** | Low | only at 10M+ rows / heavy analytics | introduce at scale | 🟢 |

## Security
| # | Risk | Sev | Evidence / impact | Action | Class |
|---|---|:--:|---|---|---|
| SE1 | **Governance read-redaction is app-layer, not a DB read boundary** (S3) | Low (pilot) / Med (public API) | RLS authorizes the row; "hidden" nulled in the loader; a direct API query could read a hidden column | treat as UI enforcement; add **DB column privileges / secured view** before any public API or regulated tenant | 🟠 |
| SE2 | **Attachments live in Supabase Storage — DB↔Storage DR consistency** | Med | DB PITR and Storage are backed up separately; a DB-only restore could orphan/mismatch attachment rows vs files | confirm **Storage is backed up**; document a consistent DB+Storage restore order; add storage to the backup-verify checklist | 🔴 (verify) |
| SE3 | **No formal security review / pentest** of the new stack | Med (process) | self-review found no High/Critical | commission a pentest | 🟠 |
| SE4 | **PII** (phone, national address, CR, tax) handling/retention | Low (pilot) | KSA pilot; single trusted app | PII/retention policy | 🟠 (before commercial) |

## Pilot execution readiness
| # | Risk | Sev | Evidence / impact | Action | Class |
|---|---|:--:|---|---|---|
| PE1 | **0110 indexes must be in the production apply set** | — | resolved: integration branch includes 0110; staging-validated via #82 | keep 0110 in the release; verify contiguity pre-prod | ✅ ensured |
| PE2 | **CI-trigger nuance:** `release/pilot → main` runs no Actions (triggers key off `claude/**`/`pull_request`) | Low | validation runs on **#82** instead | document; rely on #82 green + local full-chain proof | noted (ops) |
| PE3 | **Staging k6 + PITR drill + alert config + escalation contacts** still pending | — | ops actions, not code | execute per the playbooks before launch | 🔴 |

## Operational excellence
| # | Risk | Sev | Action | Class |
|---|---|:--:|---|---|
| OE1 | Retention/clean-up jobs absent (also SC5) | Med | scheduled jobs for audit/notifications/workflow | 🟠 |
| OE2 | Backup-verify must include **Storage** (SE2) | Med | add attachment-bucket backup check to the daily/weekly ops checklist | 🔴 |
| OE3 | Alerting/SLOs not yet configured; escalation contacts unfilled | Med | finish monitoring checklist; fill the escalation matrix | 🔴 |

---

## Net hardening picture
- **No new High/Critical risks.** Two probed concerns (RLS coverage, numbering races) **cleared**; the serverless connection concern is **architecturally avoided** (PostgREST).
- **New genuine items surfaced:** **SE2** (DB↔Storage DR consistency — verify before pilot), **ST1** (payment idempotency), **SC6** (Supabase tier sizing).
- **🔴 Before Pilot (all ops/verify, no code blockers):** SE2 storage-backup verify · PE3 staging k6 + PITR drill + alerts + escalation contacts · OE2/OE3.
- **🟠 Before First Paying Customer:** SC1–SC5 perf/scale wiring · ST1/ST2 robustness · SE1/SE3/SE4 security · OE1 retention.
- **🟢 Can Wait:** SC7/SC8, ST3.

*Risk register only. No new features, no roadmap expansion, no merge, no production deployment.*
