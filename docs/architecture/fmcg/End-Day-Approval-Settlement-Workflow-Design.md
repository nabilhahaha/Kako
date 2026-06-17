# End Day Approval & Settlement Workflow — Design

**Status:** Design capture (pre-implementation). Implementation order TBD with the
owner. **Do not start coding until this is approved and sequenced** — and not while
Return Approval final validation is in flight.

**Author intent:** A van-sales day must NOT be "closed" the moment a salesman taps
**End Day**. A day is *truly* closed only after the configured operational,
inventory, and financial reconciliations are approved. This must be **policy-driven**
(capability → policy → permission), mirroring the Return Approval Workflow — nothing
hardcoded.

---

## 1. Problem with today's behaviour

Current close (mapping references):

- `erp_work_sessions` holds the day; `status` ∈ {open, closed}, `close_status` ∈
  {open, pending_approval, closed} (`0132_day_close.sql`, `0308_day_reopen_phase1.sql`).
- `erp_close_day()` (`0132_day_close.sql:55`) computes coverage metrics and **closes
  the day immediately** (`status='closed'`) unless coverage is below a threshold, in
  which case it parks `close_status='pending_approval'`. Approval is a single
  `erp_approve_day_close()` step gated by `day.approve_close_exception`.
- There is **no cashier settlement gate, no warehouse reconciliation gate, and no
  multi-stage supervisor chain** on the close path. So a day can read "closed" while
  cash was never received, van stock never reconciled, and no supervisor signed off.

Adjacent building blocks already exist and will be reused, not reinvented:

- **Day reopen** governed request→approve→audit (`erp_day_reopen_requests`,
  `erp_request_day_reopen`/`erp_decide_day_reopen`, flag `platform.day_reopen`,
  perms `day.reopen.request|approve`).
- **Cash handover** request→confirm (`erp_cash_handover_requests`,
  `erp_request_cash_handover`/`erp_decide_cash_handover`, perm
  `cash.handover.confirm`).
- **Van stock movement** pure ledger `Opening + Load − Sales + Returns − Damage −
  Expiry ± Adjustments = Current` (`src/lib/van-sales/stock-movement.ts`, screen
  `/field/stock/movements`). This is the basis for the reconciliation stage's
  "expected closing".
- **Return Approval** is the reference pattern for policy + pure resolver + RPCs +
  delegation + SLA + reports (`erp_return_approval_policies/_rules`,
  `return-policy.ts`, `erp_request_van_return`/`erp_decide_van_return`).

---

## 2. Architecture principle (unchanged)

> **Platform Capability → Company Policy → Role Permission.** Avoid hardcoded
> business decisions; different companies operate differently through configuration.

- **Capability:** feature flag `platform.day_close_approval` (default **OFF** → today's
  direct close is unchanged). Optional `platform.day_close_sla` for SLA tracking.
- **Company Policy:** which stages are enabled, the role assigned to each stage, the
  order, separation-of-duties, SLA thresholds, variance tolerances.
- **Role Permission:** who may submit / act on each stage / reopen / override.

---

## 3. The workflow

### 3.1 Generalised stage chain

Three **generic** stages — each independently enable/disable, each **assigned to a
configurable role**, in a configurable order. Default order:

```
Salesman: Submit End Day
        ↓  (day locked from further sell/collect/return edits)
1) Supervisor Review        — operational sign-off
2) Inventory Reconciliation — van stock vs expected closing, variance
3) Financial Settlement     — cash collected vs expected, variance
        ↓
Day Closed
```

Stages are **roles-agnostic by name**: "Inventory Reconciliation" is not "the
warehouse keeper" — it is *whatever role the company assigns*. A small company may
assign **all three** stages to the Supervisor; an enterprise assigns Supervisor /
Warehouse / Cashier separately. Same engine, different policy.

> **Stage order note (open decision):** the owner's first spec ordered Cashier →
> Warehouse → Supervisor; the later spec ordered Supervisor → Warehouse → Cashier.
> This design adopts **Supervisor → Inventory → Financial** as the default because the
> latest spec is authoritative and "supervisor signs off the day, then stock, then
> money closes it" reads cleanly. The order is **policy data**, so either is
> configurable; only the default differs.

### 3.2 Status model

`erp_work_sessions` stays the day record. A new **day-close request** drives the
settlement state machine (so the session's own `status` flips to `closed` only at the
very end, exactly like Return Approval keeps the return in `pending_approval` until
posted):

```
submitted ─▶ pending_supervisor ─(reject)▶ supervisor_rejected ─▶ (back to salesman)
                   │approve
                   ▼
            pending_reconciliation ─(reject)▶ reconciliation_rejected
                   │approve
                   ▼
            pending_settlement ─(reject)▶ settlement_rejected
                   │approve
                   ▼
                 closed
```

- Disabled stages are **skipped** in the chain (the resolver computes the next
  *enabled* stage).
- Mode **Direct Close** = no stages enabled → behaves exactly like today
  (`erp_close_day`), preserving backward compatibility when the flag is OFF.
- Each `*_rejected` status returns the day to the salesman (lock released or partial,
  see §3.4) and requires a **mandatory reason**.

### 3.3 Per-stage actions & captured data

Every enabled stage supports **Approve / Reject** (reject ⇒ mandatory reason), an
optional **comment**, and stage-specific review data:

| Stage | Reviews | Captured |
| --- | --- | --- |
| **Supervisor Review** | Sales, collections, visit results, no-sales visits, route compliance, pending returns/approvals, daily summary | approver, at, reason/comment |
| **Inventory Reconciliation** | Opening · Loads · Sales · Returns · Damage · Expiry · Adjustments · **Expected closing** (from the stock-movement ledger) · **Physical count** (entered) · **Variance** | approver, at, variance per SKU + total, reason/comment |
| **Financial Settlement** | Cash collections · deposits/handovers · **Expected cash** · **Actual cash** (entered) · **Variance** | approver, at, cash variance, reason/comment |

**Audit is never collapsed.** Even when one user performs several stages, each stage
writes its **own** event row (who/when/decision/reason/variance). The header also
mirrors the canonical timestamps the owner listed: `submitted_at`,
`supervisor_approved_at`, `reconciliation_approved_at`, `settlement_approved_at`,
`closed_at`, plus `closed_by`.

### 3.4 Locking

On **Submit End Day**: the session is **locked** for further sell / collect / return
edits (the money RPCs `erp_van_sale`, `erp_collect`, `erp_van_return` /
`erp_request_van_return` gain a guard: refuse when the session has an active
non-closed day-close request). This realises "Sales summary locked for salesman
editing / Status = Pending …".

On **reject**: policy chooses one of
- **soft return** — day reopens for edits (salesman fixes and re-submits), or
- **stage bounce** — only the rejected stage is reset, the day stays locked.

Default: a rejection returns the day to the salesman (soft return) for the
operational/supervisor stage; reconciliation/settlement rejections bounce back one
stage. (Configurable later; not over-built in v1.)

### 3.5 Separation of Duties & multi-stage by one user

Policy flag **`separation_of_duties`**:

- **OFF (default for small co):** the same user may perform multiple enabled stages
  (e.g. a supervisor who also counts stock and receives cash) — **but each stage is
  still recorded separately**. The submitter can never approve their own day
  (always blocked, like Return Approval's no-self-approval).
- **ON (enterprise):** a user who acted on one sensitive stage **cannot** act on
  another stage of the same day-close. Enforced in the RPC by checking prior stage
  actors.

This is what lets one workflow serve **small (supervisor does everything) → medium
(supervisor + combined warehouse/cashier) → enterprise (three distinct roles)**.

---

## 4. Permission mapping

New permissions (group `field_ops`), assigned by default but **the active actor per
stage is the policy-assigned role**, gated by the matching permission:

| Permission | Purpose | Default roles |
| --- | --- | --- |
| `day.close.submit` | Submit End Day (salesman) | salesman, driver |
| `day.close.supervisor` | Act on Supervisor Review stage | supervisor, branch_manager, manager, admin |
| `day.close.reconcile` | Act on Inventory Reconciliation stage | warehouse_keeper, supervisor, branch_manager, admin |
| `day.close.settle` | Act on Financial Settlement stage | cashier, accountant, supervisor, branch_manager, admin |
| `day.close.reopen` | Reopen a closed day-close (special) | branch_manager, admin (+ supervisor by policy) |
| `day.close.override` | Force-close past a stuck/blocked stage | branch_manager, admin |

Notes:
- `day.close.submit` supersedes the bare `day.close` for the approval path; `day.close`
  remains for Direct mode (backward compatible).
- The **policy** names a *role* per stage (supervisor/warehouse/cashier/branch_manager/
  accountant/any). The **permission** is the always-on gate. A user may act on a stage
  iff: they hold the stage permission **and** their role matches the stage's assigned
  role (or the stage is "any authorized role") **and** separation-of-duties is
  satisfied **and** they are not the submitter.
- Reuses the existing `reconciliation.*` and `cash.handover.confirm` concepts but the
  close-stage gates are dedicated so the close chain is self-contained and auditable.

---

## 5. Data model (proposed)

Mirrors the Return Approval shape (policy table + per-company config + a request +
per-stage event rows + pure resolver). **Additive, flag-gated.**

### 5.1 Policy

```
erp_day_close_policies (
  company_id            uuid PRIMARY KEY,
  mode                  text  NOT NULL DEFAULT 'direct'
                        CHECK (mode IN ('direct','custom')),  -- custom = use stage toggles
  supervisor_enabled    boolean NOT NULL DEFAULT false,
  reconcile_enabled     boolean NOT NULL DEFAULT false,
  settle_enabled        boolean NOT NULL DEFAULT false,
  -- role assigned to each stage (text role key, or 'any')
  supervisor_role       text,   -- e.g. 'supervisor'
  reconcile_role        text,   -- e.g. 'warehouse_keeper'
  settle_role           text,   -- e.g. 'cashier'
  stage_order           text[]  DEFAULT ARRAY['supervisor','reconcile','settle'],
  separation_of_duties  boolean NOT NULL DEFAULT false,
  cash_variance_tol     numeric,         -- optional auto-flag threshold
  stock_variance_tol    numeric,
  sla_hours             numeric,         -- per-stage SLA target
  updated_at timestamptz, updated_by uuid
)
```

Convenience **presets** surfaced in the UI map onto these columns: *Direct Close*,
*Supervisor only*, *Supervisor + Settlement*, *Full chain*.

### 5.2 Request + stage events

```
erp_day_close_requests (
  id uuid PK, company_id uuid, work_session_id uuid UNIQUE, branch_id uuid,
  salesman_id uuid,
  status text CHECK (status IN
    ('pending_supervisor','supervisor_rejected',
     'pending_reconciliation','reconciliation_rejected',
     'pending_settlement','settlement_rejected','closed','reopened')),
  submitted_at timestamptz,
  supervisor_by uuid, supervisor_at timestamptz, supervisor_reason text,
  reconcile_by uuid,  reconcile_at timestamptz,  reconcile_reason text, stock_variance numeric,
  settle_by uuid,     settle_at timestamptz,     settle_reason text,    cash_variance numeric,
  closed_by uuid, closed_at timestamptz,
  reopened_by uuid, reopened_at timestamptz, reopen_reason text,
  first_viewed_at timestamptz   -- SLA (optional)
)

erp_day_close_stage_events (        -- full, non-collapsed audit (one per action)
  id uuid PK, request_id uuid, stage text, decision text,  -- approve|reject
  actor uuid, role_at_action text, decided_at timestamptz,
  reason text, comment text, variance numeric, payload jsonb
)
```

`erp_work_sessions` gains nothing structural (it already has `status`,
`close_status`, reopen counters); the request drives the chain and flips
`status='closed'` only on final approve.

### 5.3 Variance sources (no new ledgers)

- **Stock variance** = expected closing (from `stock-movement.ts`) − physical count
  (entered at the reconciliation stage).
- **Cash variance** = expected cash (collections − deposits/handovers) − actual cash
  (entered at the settlement stage).

---

## 6. Pure resolver (no I/O) — `src/lib/van-sales/day-close-policy.ts`

Mirrors `return-policy.ts`; fully unit-testable:

```ts
type Stage = 'supervisor' | 'reconcile' | 'settle';
interface DayCloseStage { stage: Stage; role: string | 'any'; }
interface DayClosePolicy {
  mode: 'direct' | 'custom';
  stages: DayCloseStage[];        // enabled, in order
  separationOfDuties: boolean;
  slaHours?: number | null;
}

enabledChain(policy): DayCloseStage[]                 // [] when direct
firstStatus(policy): Status                            // pending_<firstStage> or 'closed'
nextStatusAfter(stage, policy): Status                 // next enabled stage or 'closed'
canActOnStage(args: {                                  // delegation + SoD + submitter guard
  userRole, userPerms, stage, policy,
  isSubmitter, priorStageActors: uuid[]
}): boolean
dayCloseApprovalEnabled(flags): boolean                // platform.day_close_approval
```

Tests: direct→closes immediately; single-stage; full chain ordering; disabled-stage
skip; SoD blocks repeat actor; submitter never approves; role match / "any".

## 7. RPCs (SECURITY DEFINER, guarded, audited) — mirror Return Approval

- `erp_submit_day_close(p_work_session_id)` — perm `day.close.submit`; locks the day
  (money RPCs refuse on a locked session); creates `erp_day_close_requests` at
  `firstStatus(policy)`; `submitted_at=now()`; audit `day_close.submit`. If policy is
  Direct → delegate to existing `erp_close_day` (unchanged path).
- `erp_decide_day_close_stage(p_request_id, p_stage, p_decision, p_reason, p_payload)`
  — perm = the stage's gate; validates current status == this stage; role match;
  `canActOnStage` (SoD + not submitter); writes header fields **and** a
  `erp_day_close_stage_events` row; advances via `nextStatusAfter` or, on the final
  stage approve, sets request `closed` + `erp_work_sessions.status='closed'`,
  `closed_at`. Reject ⇒ mandatory reason + `*_rejected` + audit.
- `erp_reopen_day_close(p_request_id, p_reason)` — perm `day.close.reopen`; reason
  required; reverts session to open, stamps `reopened_*`, audit. (Builds on the
  existing reopen governance.)
- `erp_override_day_close(p_request_id, p_reason)` — perm `day.close.override`;
  force-close with reason + audit (for stuck chains).

All re-add `erp_guard_rpc` where applicable, REVOKE from anon, and write
`erp_log_audit` — consistent with existing money/governance RPCs.

---

## 8. Screens

- **Salesman** — End Day button submits (not closes); the day shows **Pending …**
  with the current stage; a read-only summary; "My Day Close" status with per-stage
  progress + rejection reasons (like *My Returns*).
- **Stage inboxes** (one queue, stage-aware, reusing the approver-queue UX with SLA
  badges 🔴>48h/🟠>24h/🟢): Supervisor Review queue, Inventory Reconciliation queue
  (with the stock-movement table + physical-count entry + variance), Financial
  Settlement queue (expected vs actual cash + variance). Each gated by its stage
  permission; one screen can switch tabs by stage the user can act on.
- **Settings › End Day Policy** (Company-Admin) — preset picker + per-stage
  enable/role assignment, stage order, Separation-of-Duties toggle, variance
  tolerances, SLA — exactly like the Return Approval policy console.

---

## 9. Reports (Phase E analogue)

Pending Day Close · Pending Supervisor · Pending Reconciliation · Pending Settlement ·
Closed Days · Rejected Days · **Stock Variance** · **Cash Variance** · **End-Day
Approval SLA** (submitted→closed, per-stage durations, aged >24h/>48h, by approver).
Backed by a pure SLA summariser like `return-sla.ts`.

---

## 10. Backward compatibility & safety

- Flag `platform.day_close_approval` **OFF** ⇒ End Day still calls `erp_close_day`;
  zero behaviour change for existing tenants.
- Policy `mode='direct'` ⇒ same.
- All money-path locks are additive guards; no existing posting logic changes.
- Reuses reopen/cash-handover/reconciliation/stock-movement assets; no duplicate
  ledgers.

---

## 11. Suggested implementation order (for decision — not started)

1. **A — Schema + policy + pure resolver + tests** (flag, tables, `day-close-policy.ts`).
2. **B — RPCs** (`submit`, `decide_stage`, `reopen`, `override`) + money-path locks +
   integration tests; Direct-mode delegation to `erp_close_day`.
3. **C — Salesman submit + My Day Close status** (lock + pending UI).
4. **D — Stage inboxes** (supervisor / reconciliation+count / settlement+cash).
5. **Settings UI** (policy console: stages, roles, order, SoD, tolerances, SLA).
6. **E — Reports + SLA**.
7. Enable for a demo company + seed a policy; validate end-to-end.

> Sequencing mirrors the Return Approval delivery that the owner has already
> validated. Implementation begins only on explicit go-ahead and after Return
> Approval final validation.

---

## 12. ADDENDUM — Separate Day / Settlement / Reconciliation statuses (carry-forward)

**Decision (owner, real-distribution model):** a day may be **operationally closed**
even when cash is not fully handed over and inventory is not reconciled. So the
single linear chain (where Financial Settlement closes the day) is **replaced** by
**three independent statuses** on one day record:

```
Day Status            : open → pending_supervisor → Closed        (operational)
Settlement Status     : not_required | pending | partial | settled (financial)
Reconciliation Status : not_required | pending | partial | reconciled (inventory)
```

- **Operational close** (the Supervisor Review stage, or Direct) is what makes
  **Day = Closed**. It no longer waits on cash or stock unless the company opts in.
- **Settlement** and **Reconciliation** are **independent tracks** that may complete
  before OR after the day closes, each on its own timeline. *"Day = Closed · Cash
  Settlement = Partial · Inventory Reconciliation = Pending"* is a valid state.

### 12.1 Settlement: Full / Partial / None + carry-forward

Store on the day record:

```
expected_cash    -- the day's collections
settled_cash     -- cash actually handed over / received
outstanding_cash -- expected_cash − settled_cash  (≥ 0)
```

- **Full** settlement: settled = expected → outstanding 0 → status `settled`.
- **Partial**: settled < expected → outstanding > 0 → status `partial`.
- **None**: settled 0 → status `pending`.

**Carry-forward (the key behaviour):** `outstanding_cash` remains assigned to the
salesman and **rolls into the next day** as the **Opening Cash Balance**. When a new
work session starts, `opening_cash_balance := previous session's outstanding_cash`.
The settlement track can still be settled later against the originating day, reducing
the carried balance.

### 12.2 Reconciliation: the same shape

`expected_stock` (from the movement ledger) · `counted_stock` (entered) ·
`stock_variance`; status `pending | partial | reconciled`. Van **custody carries
forward inherently** (van stock is persistent across days); reconciliation records the
count/variance without forcing a daily count.

### 12.3 Policy: blocking vs non-blocking (don't force daily)

Each track gains a per-company flag on `erp_day_close_policies`:

| Flag | Meaning |
| --- | --- |
| `settle_blocks_close` | If true, the day cannot reach Closed until settlement is at least … (full/none). If false, settlement is a **post-close track** (carry-forward). |
| `reconcile_blocks_close` | Same for inventory. |

- **Real distribution (owner's preference):** supervisor required to close;
  `settle_blocks_close = false`, `reconcile_blocks_close = false` → day closes,
  cash/stock custody carries forward.
- **Strict enterprise:** set the blocks-close flags true → behaves like the linear
  chain (must settle/reconcile before close).
- **Small co:** Direct close, both tracks `not_required`.

This keeps the engine policy-driven: a stage being *enabled* no longer implies it
*blocks the close* — that is now a separate, configurable property.

### 12.4 Schema delta (on top of 0325/0326)

- `erp_day_close_requests`: add `settlement_status`, `reconcile_status`,
  `expected_cash`, `settled_cash`, `outstanding_cash`, `expected_stock`,
  `counted_stock` (keep existing `stock_variance` / `cash_variance`). Decouple the
  main `status` to the operational lifecycle only.
- `erp_work_sessions`: add `opening_cash_balance` (carried from prior day's
  `outstanding_cash`) and `outstanding_cash` (closing).
- `erp_day_close_policies`: add `settle_blocks_close`, `reconcile_blocks_close`
  (default false), and a settlement granularity flag (allow partial Y/N).

### 12.5 Engine rework (impact on Phases A–C already built)

- The pure resolver gains: `operationalChain(policy)` (just the close-gating stages,
  default = supervisor) vs `tracks(policy)` (settlement, reconciliation as
  independent). `nextStatusAfter` applies only to the operational chain;
  Day=Closed once the operational chain finishes AND any *blocking* tracks are
  satisfied.
- New/!revised RPCs: `erp_settle_day_cash(request_id, settled_amount)` (full/partial,
  computes outstanding, sets settlement_status, audit) and
  `erp_reconcile_day_stock(request_id, counted, …)`; the operational close stays
  `erp_decide_day_close_stage` for the supervisor stage. A new-day start routine
  carries `outstanding_cash → opening_cash_balance`.
- Reports add: Outstanding Cash by salesman (aged), Settlement status board, Opening
  balance carry-forward, separate from the operational Closed/Pending lists.

**Status:** addendum captured. This supersedes the linear-chain assumption in §3.2
for companies that don't block close on settlement/reconciliation. Implementation of
the separation + carry-forward is the next End Day work item, pending confirmation of
§12.3's default flags.
