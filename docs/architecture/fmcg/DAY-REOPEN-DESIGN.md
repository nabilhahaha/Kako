# Day Reopen — Governed Request & Approval Workflow (Design)

**Status:** Phase 1 **IMPLEMENTED** (migration 0308, flag-gated, shipped to staging). Phase 2/3 design-first — no code until approved.
**Scope:** ONE unified FMCG operational + financial lifecycle. Flag-gated, additive, reuse-first.
**Flag:** `platform.day_reopen` (platform feature, default **OFF**).
**Guardrails:** No new engine. Reuse the existing work-session, workflow, audit,
permission and reconciliation infrastructure. Pilot-first, reversible.

---

## 0. One unified FMCG operational lifecycle

Route execution, visit, sell, collect, return, print, settlement, cash custody
and finalization all belong to **one** governed lifecycle — not separate designs.
Reopen governance, the accounting lock, cash custody and salesman liability are
facets of this single chain:

```
Open Day → Van Load Assigned → Van Load Confirmed → Route Execution → Visit →
  Statement → Collect → Sell → Return → Print → End Day → Van Reconciliation →
  Settlement Submitted → Verified (Cash Pending) → Cash Received →
  Accountant Approved → Finalized
```

| Stage | Status today | Where |
|---|---|---|
| Open Day → Van Load → Route → Visit → Statement → Collect → Sell → Return → Print → End Day | **Built** | journey/route, visit-driven route, `erp_van_sell(_with_payment)`, `erp_settle_collection`, `erp_van_return`, print templates, `erp_close_day` |
| Van Reconciliation | **Built** | `erp_van_reconciliations` / `erp_compute_van_reconciliation` |
| End Day enforcement (block after close) | **Built (shipped)** | day-close guard (server + UI) |
| **Reopen governance** | **Phase 1 (this doc, shipped)** | `erp_day_reopen_requests`, `erp_request_/decide_day_reopen` |
| Settlement Submitted → Verified (Cash Pending) → Cash Received + salesman liability | **Phase 2 (design below)** | cash-custody package |
| Accountant Approved → Finalized → journal lock | **Phase 3 (design below)** | finance posting (`KAKO_FINANCE`) |

Principles held throughout: **(1)** one operational workflow; **(2)** reopen is
always reason-based, auditable, approval-based, tracked; **(3)** Accountant
Approved is the final lock; **(4)** cash verification ≠ physical receipt; **(5)**
multi-day bulk handover; **(6)** salesman liability tracked (pending amount /
days / closed days awaiting receipt / reopen count / variances); **(7)** van +
cash reconciliation both gate finalization; **(8)** limits (max pending cash, max
pending days, max reopen count); **(9)** reuse-first — Change Requests, approval
workflows, audit logs, notifications, settlement infra, day-lifecycle infra; no
parallel engines.

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

**Cash verification ≠ cash receipt.** A cashier can *verify* the settlement
figures (the reconciliation is correct) without the salesman having physically
*handed over* the cash. A salesman may carry cash for several days and deliver it
later in one handover. So the day has **two independent tracks** that must be
modelled separately:

**Track A — Settlement / verification (the accounting state of the day)**
```
Open ─ End Day & Settle ─► Closed ─► Settlement Submitted ─► Verified ─► Accountant Approved ─► Finalized
                          status      recon                  cashier      accountant            journal
                          ='closed'   ='pending_approval'    verifies     sign-off              ='posted'
                                                             (numbers OK)  ◄── FINAL LOCK POINT
```

**Track B — Cash custody (the money state of the day)**
```
Cash Pending ──────────────────────► Cash Received
(liability sits with the salesman)   (handover to cashier; may be bulk, covering
                                      several closed days at once)
```

`Verified` lives on Track A and explicitly means **"Verified (Cash Pending)"** —
the cashier accepted the figures but the cash is still outstanding. Track B
advances independently when the physical handover happens.

We compute a derived **`lock_level`** for any closed session from **both** tracks:

| `lock_level` | Settlement track | Cash track | Reopen authority required |
|---|---|---|---|
| `none` | Closed (no recon) | Pending | **Supervisor / Admin** |
| `settlement_submitted` | recon `pending_approval` | Pending | **Supervisor / Admin** |
| `verified_cash_pending` | cashier **verified** | **Pending** | **Supervisor / Admin** + a cash-pending warning (numbers are signed but no money moved — relatively safe to reopen, recompute on close) |
| `cash_received` | verified | **Received** | **Higher-level override** (Admin) — reopening now changes a day whose cash is already in the till |
| `settlement_approved` | accountant **approved** | Received | **Higher-level override** (Admin + accountant ack) ◄ **final lock point** |
| `finalized` | journal `posted` | Received | **Platform Owner / Admin override** only |

**Rule:** reopen authority is the **higher** of the two tracks' requirements —
i.e. it considers **both** settlement status **and** cash-received status. A day
that is only `Verified (Cash Pending)` is still Supervisor-reopenable; once cash
is received **or** the accountant approves, it escalates to override.

> **Pilot reality:** `KAKO_FINANCE` is OFF, no reconciliation is `settled`, and
> no cashier verification/handover layer is live yet, so every closed pilot day is
> `lock_level='none'` today and Supervisor/Admin can approve. The verification,
> cash-custody, accountant and finalized tiers are **designed now but inert**
> until Phase 2/3 switch them on — keeping Phase 1 small while the lock semantics
> are correct from day one.

### 3.1 Cash liability & bulk handover (verification ≠ receipt)

Because a salesman can carry cash across several days and hand it over later, the
system must track **a running cash liability per salesman**, not just a per-day
cash flag. This maps **exactly** onto an existing pattern: the way collections are
allocated across multiple invoices (`erp_collections` + `erp_collection_allocations`).
We reuse that shape — **one handover can cover many closed days**:

```
Per closed day:  expected_cash  (from cash reconciliation)  →  cash_status: pending | partial | received

Salesman pending liability  =  Σ expected_cash of days NOT yet fully received

Handover (bulk):
   erp_cash_handovers (salesman, cashier, amount, received_at)
        └─ erp_cash_handover_allocations (handover_id → work_session_id, amount)   ← oldest-day-first, like collections
```

- **Cashier verifies** a day (Track A → `Verified`) by accepting the reconciliation figures — **no cash required**. Recorded with actor + timestamp.
- **Cash receipt** is a **separate** action (Track B): the cashier records a handover of an amount and the system **allocates it across the salesman's oldest cash-pending days first** (specified amounts also allowed), advancing each covered day to `received` (or `partial`).
- The salesman's screen and the cashier's screen both show **pending amount** and **pending days** (count + age of the oldest unsettled-cash day), driven from one read of the per-session `expected_cash` minus allocated receipts — same "outstanding, oldest-first" computation already used for customer collections.

This keeps **verification and receipt as distinct, separately-audited events**, supports **carry-over and bulk handover**, and gives a clean per-salesman cash-liability ledger without a new engine.

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
| `settlement_snapshot` | jsonb | `{recon_status, cash_recon_status, verified, cash_status, cash_received, expected_cash, journal_posted, reopen_count}` captured at request |
| `status` | text | `pending` / `approved` / `rejected` / `cancelled` / `applied` |
| `decided_by` | uuid NULL | approver |
| `decided_at` | timestamptz NULL | |
| `decision_note` | text NULL | approver's reason (esp. on reject/override) |
| `reopen_seq` | int | which reopen attempt for this session (1,2,…) |
| `created_at` | timestamptz | |

**Constraints**
- Partial unique index: **one `pending` request per `work_session_id`** (prevents duplicates / races).
- RLS: salesman sees own requests; approvers see their company's; standard tenant isolation.

### Counter + cash/verification fields on `erp_work_sessions` (additive columns)
- `reopen_count int NOT NULL DEFAULT 0`
- `last_reopened_at timestamptz NULL`, `last_reopened_by uuid NULL`
- `verified_at timestamptz NULL`, `verified_by uuid NULL` — cashier verification (Track A; no cash required)
- `expected_cash numeric NULL` — the day's cash liability (from cash reconciliation)
- `cash_status text NOT NULL DEFAULT 'pending'` — `pending` / `partial` / `received` (Track B; derived, but cached for fast pending-liability reads)

(Backfill defaults; existing rows untouched. Additive, reversible.)

### New tables for cash custody (mirror collections → allocations)
**`erp_cash_handovers`** — one physical handover event:
`id, company_id, salesman_id, cashier_id, amount, received_at, note, created_at`.

**`erp_cash_handover_allocations`** — splits a handover across closed days:
`id, handover_id FK, work_session_id FK, amount`. Allocation is **oldest-cash-pending-day first** (or specified per day), identical to `erp_collection_allocations`. A day's `cash_status` is `received` once `Σ allocations ≥ expected_cash`, else `partial`/`pending`.

> The **per-salesman pending liability** = `Σ expected_cash − Σ allocations` over
> the salesman's verified/closed days — the same oldest-first outstanding math the
> collection screen already runs, just keyed by salesman instead of customer.

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
2. **Authority vs `lock_level` (re-evaluated at decision time, not trusted from the snapshot — and considering BOTH settlement and cash-received status):**
   - `none` / `settlement_submitted` / `verified_cash_pending` → requires `day.reopen.approve` (Supervisor/Admin); the `verified_cash_pending` case shows a "numbers signed, cash still out" notice.
   - `cash_received` / `settlement_approved` → requires `day.reopen.override` (Admin, with accountant ack — Phase 2).
   - `finalized` → requires `day.reopen.override` held by Platform Owner/Admin (Phase 3).
3. On **approve**: flip session `status='open'`, `closed_at=NULL`, `reopen_count += 1`, `last_reopened_at/by`; set request `status='applied'`, `decided_by/at`. If recon was `settled` **or cash was already received**, mark the settlement/cash **stale → needs-recompute** so a reopened day can't silently diverge from a banked figure (Phase 2). Audit `approve_day_reopen`.
4. On **reject**: request `status='rejected'`, `decided_by/at`, `decision_note`. Day stays closed. Audit `reject_day_reopen`.

Both wrap the existing `reopenDay` status-flip logic so there is exactly one code
path that re-opens a session — now gated, reasoned, and audited.

### `erp_verify_day_settlement(p_work_session_id, p_note)` — *Phase 2*
Caller: cashier (perm `cash.verify`). Accepts the reconciliation **figures
without receiving cash**. Sets `verified_at/by` (Track A → `Verified`); leaves
`cash_status='pending'`. Audit `verify_day_settlement`. This is what makes
**Verified (Cash Pending)** a real, recorded state.

### `erp_receive_cash_handover(p_salesman_id, p_amount, p_specified, p_note)` — *Phase 2*
Caller: cashier (perm `cash.receive`). Records **one handover** that can cover
**multiple closed days**: inserts `erp_cash_handovers` then allocates across the
salesman's **oldest cash-pending days first** (or `p_specified` per session) into
`erp_cash_handover_allocations`, advancing each covered day's `cash_status` to
`received`/`partial` (Track B). Idempotent + concurrency-safe like
`erp_settle_collection`. Audit `receive_cash_handover` with the allocation map.

> Verification and receipt are **two separate RPCs / two audit events** — a
> cashier can verify today and receive cash days later in one bulk handover.

---

## 6. Approval roles & permissions

New permission keys (added to `src/lib/erp/permissions.ts` + role seeding):

| Permission | Default holders | Purpose |
|---|---|---|
| `day.reopen.request` | salesman | submit a reopen request |
| `day.reopen.approve` | supervisor, manager, admin | approve reopen when `lock_level ≤ verified_cash_pending` |
| `day.reopen.override` | admin, platform owner | approve reopen when `lock_level ≥ cash_received` / `settlement_approved` / `finalized` |
| `cash.verify` | cashier, accountant | verify settlement figures **without** receiving cash (Track A) — *Phase 2* |
| `cash.receive` | cashier | record a (possibly bulk, multi-day) cash handover (Track B) — *Phase 2* |

- The **salesman cannot self-approve** (request and approve are distinct perms; the decide RPC rejects `requested_by = decider`).
- **Cashier** owns the cash track: `cash.verify` (numbers) and `cash.receive` (money) are separate, so verification can precede receipt by days.
- Accountant participates at the `settlement_approved` tier (Phase 2): the override path requires an accountant acknowledgement before Admin can grant.
- Reuse `canSeeWorkflowInbox` / the approvals inbox for surfacing pending requests to approvers.

---

## 7. Audit

Everything routes through the existing `erp_audit_logs` + `erp_log_audit` (actor
stamped from `auth.uid()`, unforgeable). Recorded actions:

- `request_day_reopen` — actor, session, reason, lock_level, snapshot.
- `approve_day_reopen` / `reject_day_reopen` — actor, decision note, prior lock_level, resulting reopen_count.
- `verify_day_settlement` — cashier, session, note (cash-pending verification). *Phase 2*
- `receive_cash_handover` — cashier, salesman, amount, the per-session allocation map. *Phase 2*
- (Optional) `day_reopen.requested` / `…decided` domain events on the event bus for downstream notification.

A closed day's full reopen history **and** cash-custody history are reconstructable:
every request, who verified the figures, when (and how much) cash was received,
which handover covered which day, who decided each reopen, why, the settlement +
cash state at the time, and how many times the day has been reopened.

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
- The gate (and the My-Day hub) also shows the salesman's **pending cash liability**: *"Cash to hand over: 4,250 across 3 days (oldest 5 days)"* — driven by the Track-B math. *Phase 2.*
- If `lock_level = finalized`, the Request button is replaced by an info line: *"This day is finalized by accounting and cannot be reopened without a platform override."*

### Approver — the approvals inbox (reuse existing inbox)
A pending **Day Reopen** card shows exactly what the rule requires:
- Salesman, branch, work date
- **Reason** (+ note/attachment)
- **Settlement status** (reconciliation state) and **Verified (Cash Pending)?**
- **Accountant approval status** (settlement_approved? yes/no)
- **Cash received status** (received / partial / pending) + the day's `expected_cash`
- **Reopen count** (how many times already reopened)
- Actions: **Approve** / **Reject** (reject requires a note). Approve disabled when the approver's permission tier is below the request's `lock_level`, with a clear reason.

### Cashier — verification & cash handover (*Phase 2*)
A cashier screen lists, per salesman, the **closed days awaiting verification** and
the **running cash liability** (pending amount + pending days/age). Two distinct
actions:
- **Verify** a day's figures → Track A `Verified (Cash Pending)`, no money moved.
- **Receive cash** → enter one amount; the system allocates it **oldest-pending-day first** across the salesman's days (a single handover can clear several days at once), each covered day → `received`/`partial`.

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
| **Verified but cash still pending** | Reopen stays Supervisor-approvable (numbers signed, no money moved); on reopen the verification is cleared so the cashier re-verifies after the correction. |
| **Reopen after cash already received** | Escalates to `day.reopen.override`; on approve, the affected handover allocation is flagged for review so the banked figure and the day can't silently disagree. |
| **Cash carried across days / bulk handover** | One `erp_cash_handover` allocates across many `work_session_id`s (oldest-first); partial handovers leave `cash_status='partial'` and reduce the pending liability incrementally. |
| **Handover exceeds outstanding** | Allocation caps at each day's `expected_cash`; any surplus is rejected or held as unallocated (cashier resolves) — never silently over-applied. |
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
| **Cash liability accumulation** — rep carries large cash for many days | Per-salesman pending amount + pending-days age are surfaced (rep + cashier + supervisor); optional liability/age threshold alert reusing the existing alerts surface. |
| **Verify/receipt confusion** | Two separate perms, RPCs, and audit events; the UI labels the cash-pending state explicitly so "verified" is never read as "cash in hand." |
| **Privilege creep** | Three distinct perms; request ≠ approve ≠ override; salesman can never self-serve. |
| **Audit gaps** | All paths go through `erp_log_audit`; the bare super-admin `reopenDay` is removed/redirected through the governed RPC. |
| **Scope creep into accounting** | Phase 1 ships only the request/approve loop at `lock_level='none'`; accounting tiers are designed but inert until their flags/layers exist. |
| **Tenant isolation** | RLS on the new table; RPCs are SECURITY DEFINER with tenant + branch guards like `erp_close_day`. |

---

## 11. Recommended implementation phases

**Phase 1 — Governed reopen loop (pilot, flag default OFF) — ✅ IMPLEMENTED (migration 0308)**
- `platform.day_reopen` flag + i18n.
- `erp_day_reopen_requests` table + session counters (additive migration).
- `erp_request_day_reopen` / `erp_decide_day_reopen` RPCs (Supervisor/Admin tier; `lock_level` computed, higher tiers inert).
- New perms `day.reopen.request` / `day.reopen.approve` (+ `day.reopen.override` reserved).
- Gate UI (Request to reopen + pending banner) + approver inbox card.
- Audit on every action. Redirect/retire the bare `reopenDay` through the governed path.
- UAT scenarios: request → approve → reopen → re-sell → re-close; request → reject; only-latest-day rule; reason-required; self-approval blocked.

**Phase 2 — Settlement-aware locking + cash custody (verification ≠ receipt)**
- Wire `lock_level` to van + cash reconciliation statuses; accountant in the `settlement_approved` tier; `day.reopen.override` for post-settlement / post-cash-received reopen; reconciliation auto-stale-on-reopen.
- Cash track: `verified_at/by` + `expected_cash` + `cash_status` on the session; `erp_cash_handovers` + `erp_cash_handover_allocations`; `cash.verify` / `cash.receive` perms and RPCs; cashier screen + per-salesman pending-liability (amount + days); reopen rules consider **both** settlement and cash-received status.

**Phase 3 — Accounting finalization lock**
- Wire `finalized` to journal posting (`KAKO_FINANCE`); Platform-Owner override; full period-close interaction.

---

## 12. Open question for sign-off

The pilot has no accountant-settlement, cash-custody, or finance posting live yet
(`KAKO_FINANCE` OFF, no recon `settled`, no cashier verify/handover layer). I
recommend **Phase 1 = the governed reopen request/approve loop at
`lock_level='none'` (Supervisor/Admin)**, with the verification, cash-custody
(verify ≠ receipt + bulk handover), accountant, and finalized tiers **built into
the lifecycle/model now but inert**, delivered in **Phase 2** as a self-contained
cash-custody package. This keeps Phase 1 shippable for your current UAT while the
two-track (settlement × cash) lock semantics are correct from day one.

**Confirm:** (a) Phase 1 scope as above; and (b) whether the cash-custody track
(verification-without-receipt, per-salesman liability, bulk multi-day handover)
should be **Phase 2 of this same workstream**, or split into its own dedicated
"Salesman Cash Custody / Handover" design since it's a substantial finance feature
in its own right (it's useful independently of reopen).

> **Decisions (approved):** Phase 1 = governed reopen loop only — **shipped**.
> Cash custody stays **Phase 2 of this same workstream** (one unified lifecycle,
> not two designs). Sequence: Phase 1 reopen → Phase 2 cash custody +
> settlement-aware reopen → Phase 3 accountant approval + finalization + journal
> lock, reopen rules ultimately driven by settlement × cash × accountant status.

---

# Appendix A — Phase 2 preparation package (before coding Phase 2)

Phase 2 = Cash Custody, Cash Pending, Cash Receipt, Salesman Liability, Multi-Day
Handover, and Settlement-Aware Reopen Rules. This appendix is the pre-code review
the workstream requires. **No Phase 2 code until this is approved.**

## A1. Current infrastructure inventory (grounded)
| Area | Exists today | Reuse for Phase 2 |
|---|---|---|
| Work session | `erp_work_sessions` (status, close_status, reopen_count) | host the cash/verification fields |
| Van reconciliation | `erp_van_reconciliations` (draft/pending_approval/settled/rejected) + `erp_compute_van_reconciliation` (perm `reconciliation.manage/approve`) | Settlement Submitted / Approved states |
| Cash reconciliation | `erp_van_cash_reconciliations` (opening/sales/collections/returns/expenses → expected vs counted, variance; draft/settled/rejected) | source of `expected_cash` + variance |
| Van accounting | `erp_van_opening_balances`, `erp_van_expenses(+categories)` (migration 0229) | cash math inputs |
| Collections allocation | `erp_collections` + `erp_collection_allocations` (oldest-first, idempotent via `erp_settle_collection`) | **template for cash handover allocation** |
| Approvals | generic workflow (`erp_workflow_start/decide`, `erp_workflow_definitions` event-triggered) + Change Requests (`erp_change_requests`) + lightweight request tables (`erp_credit_limit_requests`) | route verify/receipt approvals |
| Audit | `erp_audit_logs` + `erp_log_audit` (SECURITY DEFINER, unforgeable) | same trail, `entity='work_session'` |
| Events / notify | `erp_events` + `emitDomainEvent` / `EVENT` (KAKO_EVENTS) | notify cashier/supervisor |
| Permissions | catalog + `erp_user_has_perm`; roles incl. cashier, accountant | add `cash.verify` / `cash.receive` |
| Finance posting | `erp_post_journal_entry` (status `posted`, `KAKO_FINANCE` OFF) | Phase 3 finalize lock |

## A2. Existing reusable components
- **Allocation engine pattern** (collections→allocations) → cash handover→allocations, **oldest-pending-day-first**, idempotent.
- **`erp_close_day` RPC family** (perm + tenant guard + audit) → `erp_verify_day_settlement`, `erp_receive_cash_handover`.
- **Outstanding/oldest-first read** (the collection screen) → per-salesman pending-liability list (keyed by salesman not customer).
- **CreditStandingCard / debt snapshot** UI idiom → salesman liability card.
- **Approvals inbox + audit log + event bus + feature-flag + i18n-parity** scaffolding — all already in place.

## A3. Required additions (Phase 2)
- **Schema:** session `verified_at/by`, `expected_cash`, `cash_status`; tables `erp_cash_handovers` + `erp_cash_handover_allocations`; company limits `max_pending_cash`, `max_pending_days`, `max_reopen_count` (extend `erp_fmcg_settings`).
- **RPCs:** `erp_verify_day_settlement` (cashier, no cash), `erp_receive_cash_handover` (bulk allocate), and `lock_level` computation wired to recon/cash statuses; reopen decide RPC reads the real `lock_level`.
- **Perms:** `cash.verify`, `cash.receive` (cashier/accountant); `day.reopen.override` activated for `cash_received`/`settlement_approved`.
- **UI:** cashier screen (verify + receive + per-salesman liability); rep + hub liability card; approver inbox shows verified / cash-received status.

## A4. Approval model
- **Verify** (cashier, `cash.verify`) — accept figures, no cash. **Receive** (cashier, `cash.receive`) — physical/bulk handover. **Reopen** authority = higher of settlement vs cash tier (Supervisor ≤ verified_cash_pending; Admin override ≥ cash_received). Accountant participates at `settlement_approved`. No self-approval anywhere.

## A5. Audit model (single trail)
All Phase 2 events (`verify_day_settlement`, `receive_cash_handover`, plus the existing reopen actions) write to **`erp_audit_logs` keyed by `entity='work_session'` / `entity_id=work_session_id`**, so a day's complete operational + cash + reopen history is one reconstructable timeline. Phase 3 (accountant/finalize) appends to the same trail. No separate logs.

## A6. Data-model impact
Additive only: new columns (nullable / defaulted), two new tables, settings columns. No change to existing invoice/collection/reconciliation semantics; `cash_status` is derived but cached for fast liability reads. Fully reversible.

## A7. Risks
Financial integrity on reopen-after-received (→ override + flag allocation for review + recon stale-on-reopen); liability accumulation (→ limits + alerts); verify/receipt confusion (→ distinct perms/RPCs/labels); offline (cash actions are cashier-side/online); tenant isolation (RLS + SECURITY DEFINER guards).

## A8. Migration strategy
One additive migration (`03xx_cash_custody_phase2`) — columns + tables + RPCs + perms + settings, all `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`, behind the same `platform.day_reopen` (or a sibling `platform.cash_custody`) flag, default OFF. Existing tenants unaffected until opted in; pilot-first; documented rollback.

## A9. Recommended implementation sequence
1. Settings limits + session cash fields (inert).
2. `erp_verify_day_settlement` + Verified state + cashier verify UI.
3. `erp_cash_handovers(+allocations)` + `erp_receive_cash_handover` (bulk, oldest-first) + receipt UI.
4. Per-salesman liability read + rep/hub/cashier cards + limit checks/alerts.
5. Wire `lock_level` (settlement × cash) into the reopen decide RPC + `day.reopen.override`.
6. Validate on staging (verify-without-receipt, multi-day bulk handover, reopen-after-received escalation, liability math, invariants); UAT; then Phase 3.

---

# Appendix B — Becoming the FMCG default (promotion & migration)

**Goal:** Pilot → Validate → **FMCG Standard** → future FMCG companies inherit the
governed day lifecycle automatically (Day-Close Governance, Reopen Request,
Approval Flow, Audit Trail, Day-Close Enforcement) with **no manual config**.
Existing FMCG companies stay unchanged until explicitly migrated.

## B1. Pilot implementation (done)
Migration 0308 (flag-gated, default OFF) + pilot-only enablement on staging
(`platform.day_reopen=true`, `day.reopen.request/.approve` granted to the pilot's
roles). This is the validation surface. **No promotion happens until UAT passes.**

## B2. What is already template-level vs what promotion adds
| Capability | Mechanism | Already default for new companies? |
|---|---|---|
| Reopen **permissions** (`day.reopen.request/.approve`) | seeded into the template `erp_role_permissions` by 0308 → copied to each new company by `erp_seed_company_roles()` | ✅ Yes (new FMCG companies inherit the perms) |
| **Day-Close Enforcement** | code-level guard gated on Van Sales being active (not a flag) | ✅ Yes (automatic wherever van-sales is on) |
| Audit trail | `erp_log_audit` inside the RPCs | ✅ Yes (intrinsic) |
| Reopen **workflow visibility** (UI + RPC entry) | `platform.day_reopen` feature flag, currently catalog default OFF (`templates: []`) | ❌ **This is the one thing promotion must flip on for FMCG** |

So "promote to FMCG default" reduces to **defaulting the flag ON for FMCG
companies** — everything else already rides the template/role/code path.

## B3. FMCG default template promotion strategy (post-validation)
A small follow-up migration `03xx_day_reopen_fmcg_default` that, **after pilot
sign-off**, makes the flag inherit automatically for **new FMCG companies only**:
- Add an FMCG business-type default-flags seeding step at company creation —
  mirror `erp_seed_company_roles()`: a `erp_seed_company_feature_flags(company_id)`
  (or extend the existing creation hook) that inserts `platform.day_reopen=true`
  into `erp_feature_flags` when the company's business type is FMCG / distribution.
- Keep `templates: []` in the catalog (so non-FMCG verticals are unaffected) — the
  default is applied **by business type at creation**, not globally by tier.
- Net result: **a new FMCG tenant is correct from day one** — perms (already
  templated) + flag (seeded ON) + enforcement (automatic). No manual setup.

## B4. Existing FMCG company migration strategy (opt-in, explicit)
Mirror the proven `erp_apply_fmcg_salesman_default(company_id)` pattern (0307):
an idempotent, Platform-Owner-only **`erp_apply_fmcg_day_reopen_default(company_id)`**
that, for one chosen existing company, (a) ensures the role perms exist in its
`erp_company_role_permissions`, and (b) sets `platform.day_reopen=true`. Existing
companies are **never** touched implicitly; an admin runs the migrator per company
when ready. Overrides preserved; re-runnable.

## B5. Rollback strategy
- **Per company (instant):** set `platform.day_reopen=false` — the request/approval
  UI and RPC entry points disappear; the day-close enforcement (separate) stays.
  No data loss; existing requests remain for audit.
- **Promotion rollback:** drop the FMCG creation-seeding step (new companies stop
  defaulting it ON); already-created companies keep their stored flag (flip
  individually if desired).
- **Full feature rollback:** the 0308 manual rollback block (drop RPCs + table +
  session columns + template perms). Additive throughout, so reversible.
- **Guardrail:** promotion is gated on **explicit pilot sign-off**; existing tenants
  change only via the opt-in migrator. Pilot → Validate → FMCG Standard → inherit.

## B6. Feature-flag ownership & override rules
- **Flag:** `platform.day_reopen` — a per-company row in `erp_feature_flags`
  (`company_id, feature_key, enabled`); catalog default **OFF** (`templates: []`).
- **Resolution / precedence (per `getFeatureFlags`):** a stored company row **wins**
  over the catalog default. Order: Platform-Owner/super-admin action → company
  stored flag → catalog default. There is no global on-switch; it is per company.
- **Who may toggle:** the **Platform Owner** (any company) and a **Company Admin**
  for their own company (the `erp_feature_flags` write RLS is company-admin gated).
  Salesmen/supervisors **cannot** change it — they only operate within it.
- **Where:** Company Settings → Feature Configuration (the existing flags screen);
  Platform-Owner tooling for cross-company control; and (post-promotion) the FMCG
  creation-seeding for new companies.
- **Enforcement is server-authoritative AND layered:** the flag gates (1) the rep
  gate UI (`loadDayReopenGate`), (2) the approver page + hub inbox, and (3) the
  **server actions** `requestDayReopen` / `decideReopenRequest` (which now
  short-circuit when the flag is OFF) — so "feature off" means off everywhere, even
  though the template seeds the perms to every new company. Permissions
  (`day.reopen.request/.approve`) gate *who*; the flag gates *whether the workflow
  exists for the company*. Both must be true.
- **Override behaviour is non-destructive:** turning the flag OFF hides the UI and
  blocks new requests/decisions immediately; existing `erp_day_reopen_requests`
  rows and audit history are **retained** (read-only). Turning it back ON resumes
  with full history intact. Day-Close **Enforcement** is independent of this flag
  (code-level, van-sales-gated) and is unaffected by toggling it.
