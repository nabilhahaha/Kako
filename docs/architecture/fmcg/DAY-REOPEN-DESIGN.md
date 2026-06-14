# Day Reopen — Governed Request & Approval Workflow (Design)

**Status:** Design-first. No code until approved.
**Scope:** FMCG van-sales day lifecycle. Flag-gated, additive, reuse-first.
**Flag:** `platform.day_reopen` (platform feature, default **OFF**).
**Guardrails:** No new engine. Reuse the existing work-session, workflow, audit,
permission and reconciliation infrastructure. Pilot-first, reversible.

---

## 1. Why this exists

After **End Day & Settle** the new day-close guard (shipped: server + UI) blocks
Sell / Collect / Return / Issue and requires a *new* day. That is correct, but it
is **terminal** — a legitimately-closed day cannot be re-opened for a late
correction (a missed collection, a return the customer brought after settlement,
a mis-keyed line). Today the only escape hatch is `reopenDay(sessionId)` in
`src/app/(app)/rep/actions.ts` — a **super-admin-only direct status flip with no
request, no reason, no approval, and no audit trail.** That is unsafe for a real
distributor.

This design replaces that bare primitive with a **governed, audited, role-gated
reopen request** whose authority **depends on settlement status**, with the
**accountant confirmation as the final lock point of the day.**

---

## 2. Current day-close lifecycle (as-is, grounded in code)

| State | Where it lives today | How reached |
|---|---|---|
| **Open** | `erp_work_sessions.status='open'` | `startDay()` inserts the row (rep) |
| **Closed (simple)** | `erp_work_sessions.status='closed'`, `closed_at` set | `endDay()` (rep app) **or** `erp_close_day()` RPC when coverage ≥ threshold |
| **Pending close approval** | `close_status='pending_approval'` (status still open) | `erp_close_day()` when `coverage_pct < day_close_require_approval_below` |
| **Close approved** | `close_status='closed'`, `status='closed'`, `approved_by/at` | `erp_approve_day_close()` (perm `day.approve_close_exception`) |
| **Reopened** | `status='open'`, `closed_at=NULL` | `reopenDay()` — **super-admin only, no audit** |

**Settlement / accounting layers that exist (separate from the session):**

- **Van reconciliation** — `erp_van_reconciliations.status ∈ {draft, pending_approval, settled, rejected}` (`erp_compute_van_reconciliation`, perm `reconciliation.manage`; approval perm `reconciliation.approve`).
- **Van cash reconciliation** — `erp_van_cash_reconciliations.status ∈ {draft, settled, rejected}` (expected vs counted cash → variance).
- **Journal posting** — `erp_journal_entries.status='posted'` via `erp_post_journal_entry` (gated by `KAKO_FINANCE`, **default OFF**; inert in the pilot).

**Key finding:** there is **no "settlement submitted / accountant approved /
finalized" state on `erp_work_sessions` today.** The user's desired lifecycle is
a *governance overlay* we will derive from the reconciliation + posting statuses
above — not a new parallel accounting engine.

---

## 3. Target lifecycle & the lock point

Mapping the requested model onto what the system actually has:

```
Open
 └─ End Day & Settle ─────────────► Closed                (status='closed')
                                      │
            (van/cash reconciliation submitted)
                                      ▼
                              Settlement Submitted          (recon status='pending_approval')
                                      │
            (reconciliation.approve  / accountant sign-off)
                                      ▼
                              Settlement Approved  ◄── FINAL LOCK POINT
                                      │
            (journal posting, KAKO_FINANCE)
                                      ▼
                                  Finalized                 (journal status='posted')
```

We compute a single derived **`lock_level`** for any closed session:

| `lock_level` | Derived from | Reopen authority required |
|---|---|---|
| `none` | Closed, no reconciliation submitted | **Supervisor / Admin** approval |
| `settlement_submitted` | recon `pending_approval` | **Supervisor / Admin** approval |
| `settlement_approved` | recon `settled` **or** cash recon `settled` | **Higher-level override** (Admin + accountant ack) |
| `finalized` | any journal entry `posted` for the session's documents | **Platform Owner / Admin override** only |

**The accountant confirmation (`settlement_approved`) is the final lock point.**
Below it → Supervisor/Admin can approve a reopen. At or above it → reopen is
**blocked unless a higher-level override exists.**

> **Pilot reality:** `KAKO_FINANCE` is OFF and no reconciliation is `settled` in
> the pilot yet, so in practice every closed pilot day is `lock_level='none'` and
> Supervisor/Admin can approve. The higher tiers are **designed now but inert**
> until those layers are switched on (Phase 2/3). This keeps Phase 1 small while
> the lock semantics are correct from day one.

---

## 4. Reopen-request data model (reuse-first)

Mirror the proven lightweight request pattern (`erp_credit_limit_requests`),
**not** a bespoke engine. One new table + a small counter on the session.

### New table: `erp_day_reopen_requests`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | uuid | tenant scope (RLS) |
| `work_session_id` | uuid FK → `erp_work_sessions` | the closed day |
| `requested_by` | uuid | salesman |
| `reason` | text **NOT NULL** | mandatory |
| `note` | text NULL | optional |
| `attachment_url` | text NULL | optional (reuse existing storage bucket; Phase 1 may omit) |
| `lock_level` | text | snapshot at request time (`none`/`settlement_submitted`/`settlement_approved`/`finalized`) |
| `settlement_snapshot` | jsonb | `{recon_status, cash_recon_status, journal_posted, reopen_count}` captured at request |
| `status` | text | `pending` / `approved` / `rejected` / `cancelled` / `applied` |
| `decided_by` | uuid NULL | approver |
| `decided_at` | timestamptz NULL | |
| `decision_note` | text NULL | approver's reason (esp. on reject/override) |
| `reopen_seq` | int | which reopen attempt for this session (1,2,…) |
| `created_at` | timestamptz | |

**Constraints**
- Partial unique index: **one `pending` request per `work_session_id`** (prevents duplicates / races).
- RLS: salesman sees own requests; approvers see their company's; standard tenant isolation.

### Counter on `erp_work_sessions` (additive columns)
- `reopen_count int NOT NULL DEFAULT 0`
- `last_reopened_at timestamptz NULL`
- `last_reopened_by uuid NULL`

(Backfill default 0; existing rows untouched. Additive, reversible.)

---

## 5. RPCs (atomic, SECURITY DEFINER, server-authoritative)

Two new RPCs in the `erp_close_day` family, following its exact validation +
audit pattern.

### `erp_request_day_reopen(p_work_session_id, p_reason, p_note, p_attachment_url)`
Caller: salesman (perm `day.reopen.request`). Validates:
1. Session belongs to caller (or same branch) and is **`status='closed'`**.
2. It is the **latest** session for the salesman (no newer session exists) — *only the latest closed day is reopenable*.
3. **Reason non-empty.**
4. No existing `pending` request for the session.
5. Computes `lock_level` + `settlement_snapshot`; if `finalized` → reject unless `day.reopen.override` present on caller (it won't be) ⇒ salesman gets *"Day is finalized by accounting — reopen needs a platform override."*
6. Inserts request `status='pending'`, `reopen_seq = reopen_count+1`.
7. Emits `day_reopen.requested` event (routes to the approver inbox) + `erp_log_audit('request_day_reopen','work_session', …)`.

### `erp_decide_day_reopen(p_request_id, p_decision, p_note)`
Caller: approver. `p_decision ∈ {approve, reject}`. Validates:
1. Request is `pending`.
2. **Authority vs `lock_level` (re-evaluated at decision time, not trusted from the snapshot):**
   - `none` / `settlement_submitted` → requires `day.reopen.approve` (Supervisor/Admin).
   - `settlement_approved` → requires `day.reopen.override` (Admin, with accountant ack — Phase 2).
   - `finalized` → requires `day.reopen.override` held by Platform Owner/Admin (Phase 3).
3. On **approve**: flip session `status='open'`, `closed_at=NULL`, `reopen_count += 1`, `last_reopened_at/by`; set request `status='applied'`, `decided_by/at`. If recon was `settled`, mark it **stale/needs-recompute** (Phase 2). Audit `approve_day_reopen`.
4. On **reject**: request `status='rejected'`, `decided_by/at`, `decision_note`. Day stays closed. Audit `reject_day_reopen`.

Both wrap the existing `reopenDay` status-flip logic so there is exactly one code
path that re-opens a session — now gated, reasoned, and audited.

---

## 6. Approval roles & permissions

New permission keys (added to `src/lib/erp/permissions.ts` + role seeding):

| Permission | Default holders | Purpose |
|---|---|---|
| `day.reopen.request` | salesman | submit a reopen request |
| `day.reopen.approve` | supervisor, manager, admin | approve reopen when `lock_level ≤ settlement_submitted` |
| `day.reopen.override` | admin, platform owner | approve reopen when `lock_level ≥ settlement_approved` / `finalized` |

- The **salesman cannot self-approve** (request and approve are distinct perms; the decide RPC rejects `requested_by = decider`).
- Accountant participates at the `settlement_approved` tier (Phase 2): the override path requires an accountant acknowledgement before Admin can grant.
- Reuse `canSeeWorkflowInbox` / the approvals inbox for surfacing pending requests to approvers.

---

## 7. Audit

Everything routes through the existing `erp_audit_logs` + `erp_log_audit` (actor
stamped from `auth.uid()`, unforgeable). Recorded actions:

- `request_day_reopen` — actor, session, reason, lock_level, snapshot.
- `approve_day_reopen` / `reject_day_reopen` — actor, decision note, prior lock_level, resulting reopen_count.
- (Optional) `day_reopen.requested` / `…decided` domain events on the event bus for downstream notification.

A closed day's full reopen history is reconstructable: every request, who decided,
why, the settlement state at the time, and how many times it has been reopened.

---

## 8. UI flow

### Salesman — the Day Closed gate (extend the shipped `DayClosedGate`)
When the day is closed and `platform.day_reopen` is ON:
```
🔒 Your day is closed
   The day is closed and the van is settled.
   [ Start a new day ]          ← existing primary
   [ Request to reopen day ]    ← new secondary
```
- **Request** opens a form: **Reason (required)**, Note (optional), Attachment (optional, Phase 1 may defer).
- After submit, the gate shows a **pending banner**: *"Reopen requested — awaiting Supervisor/Admin approval"* with the current settlement status and reopen count. The Sell/Collect/Return actions stay blocked until approved.
- If `lock_level = finalized`, the Request button is replaced by an info line: *"This day is finalized by accounting and cannot be reopened without a platform override."*

### Approver — the approvals inbox (reuse existing inbox)
A pending **Day Reopen** card shows exactly what the rule requires:
- Salesman, branch, work date
- **Reason** (+ note/attachment)
- **Settlement status** (reconciliation state)
- **Accountant approval status** (settlement_approved? yes/no)
- **Reopen count** (how many times already reopened)
- Actions: **Approve** / **Reject** (reject requires a note). Approve disabled when the approver's permission tier is below the request's `lock_level`, with a clear reason.

### After approval
Session re-opens; the salesman's gate clears; Sell/Collect/Return allowed again
**until End Day & Settle is performed again** (which can itself be followed by a
new reopen request — `reopen_count` increments each cycle).

---

## 9. Edge cases

| Case | Handling |
|---|---|
| Two reopen requests at once | Partial unique index → one `pending` per session; second submit returns *"a request is already pending."* |
| Rep already started a NEXT day | Target is no longer the latest session → reopen **blocked** ("only the latest closed day can be reopened"). |
| Approve race / double-approve | Decide RPC requires `status='pending'`; second decide no-ops. |
| Reason missing | Request RPC rejects (server-enforced, not just UI). |
| Reopen after recon `settled` | Requires `day.reopen.override`; on approve, recon marked **stale → recompute** (Phase 2) so settlement can't silently drift. |
| Reopen after journal `posted` | Blocked unless Platform Owner/Admin override (Phase 3); never silent. |
| Self-approval | Decide RPC rejects `decider == requested_by`. |
| Offline rep | Reopen needs a connection (server approval) — not available offline; documented. |
| Cancel | Salesman may `cancel` own `pending` request (status `cancelled`, audited). |
| Time zone / `work_date` | Reuse the existing `today()` semantics; the request targets a specific `work_session_id`, not "today", so it's unambiguous. |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Financial integrity** — editing a settled/posted day | Tiered `lock_level`; accountant approval is the hard lock; override is explicit, logged, and Platform-Owner-gated. |
| **Reconciliation drift** — reopen invalidates a prior settlement | On reopen above `none`, mark reconciliation stale + require recompute before re-settle (Phase 2). |
| **Abuse / reopen loops** | `reopen_count` is visible on every request and audited; optional threshold alert for repeated reopens. |
| **Privilege creep** | Three distinct perms; request ≠ approve ≠ override; salesman can never self-serve. |
| **Audit gaps** | All paths go through `erp_log_audit`; the bare super-admin `reopenDay` is removed/redirected through the governed RPC. |
| **Scope creep into accounting** | Phase 1 ships only the request/approve loop at `lock_level='none'`; accounting tiers are designed but inert until their flags/layers exist. |
| **Tenant isolation** | RLS on the new table; RPCs are SECURITY DEFINER with tenant + branch guards like `erp_close_day`. |

---

## 11. Recommended implementation phases

**Phase 1 — Governed reopen loop (pilot, flag default OFF)**
- `platform.day_reopen` flag + i18n.
- `erp_day_reopen_requests` table + session counters (additive migration).
- `erp_request_day_reopen` / `erp_decide_day_reopen` RPCs (Supervisor/Admin tier; `lock_level` computed, higher tiers inert).
- New perms `day.reopen.request` / `day.reopen.approve` (+ `day.reopen.override` reserved).
- Gate UI (Request to reopen + pending banner) + approver inbox card.
- Audit on every action. Redirect/retire the bare `reopenDay` through the governed path.
- UAT scenarios: request → approve → reopen → re-sell → re-close; request → reject; only-latest-day rule; reason-required; self-approval blocked.

**Phase 2 — Settlement-aware locking**
- Wire `lock_level` to van + cash reconciliation statuses; accountant in the `settlement_approved` tier; `day.reopen.override` for post-settlement reopen; reconciliation auto-stale-on-reopen.

**Phase 3 — Accounting finalization lock**
- Wire `finalized` to journal posting (`KAKO_FINANCE`); Platform-Owner override; full period-close interaction.

---

## 12. Open question for sign-off

The pilot has no accountant-settlement or finance posting live yet
(`KAKO_FINANCE` OFF, no recon `settled`). I recommend **Phase 1 = Supervisor/Admin
approval at `lock_level='none'`**, with the settlement/accountant/finalized tiers
**built into the model but inert** until Phase 2/3. Confirm that's the right
sequencing, or if you'd rather I stub the accountant-approval tier as active now
(it would currently never trigger in the pilot).
