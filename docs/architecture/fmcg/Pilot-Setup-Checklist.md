# Pilot Setup Checklist — FMCG Field Suite

Operational runbook to take a company live on the FMCG suite. Complete every box
before pilot users touch the system. Pairs with the Pilot Readiness Audit
(`Pilot-Readiness-Audit-2026.md`). SQL targets the staging project
`rsjvgehvastmawzwnqcs` (adjust `:co` to the pilot company id).

---

## 1. Capabilities (feature flags) — enable per company

| Capability flag | Purpose | Default |
|---|---|---|
| `platform.return_approval` | Return approval workflow | OFF |
| `platform.return_approval_sla` | Return SLA tracking | OFF |
| `platform.day_close_approval` | End Day approval & settlement | OFF |
| `platform.day_close_sla` | End Day SLA tracking | OFF |
| `platform.daily_summary` | Daily Summary dashboard | per template |
| `platform.stock_movement_report` | Van Stock Movement report | per template |

```sql
INSERT INTO erp_feature_flags(company_id, feature_key, enabled)
SELECT :'co'::uuid, k, true FROM (VALUES
  ('platform.return_approval'),('platform.return_approval_sla'),
  ('platform.day_close_approval'),('platform.day_close_sla')) AS f(k)
ON CONFLICT (company_id, feature_key) DO UPDATE SET enabled = excluded.enabled;
```

- [ ] Return Approval flag ON
- [ ] End Day Approval flag ON
- [ ] SLA flags ON (optional but recommended)
- [ ] Daily Summary / Stock Movement ON (operational visibility)

---

## 2. Company policies — configure (Settings, `settings.workflow_policy`)

- [ ] **Return Approval policy** (`/settings/returns`): mode (open/approval),
  primary + backup approver, rules (e.g. damage→approval, saleable ≤500→auto).
  Seed available: `supabase/pilot/seed-return-approval-demo.sql`.
- [ ] **End Day policy** (`/settings/day-close`): mode (Direct vs chain), enable
  Supervisor / Inventory / Financial stages + assigned roles, blocking flags
  (`settle_blocks_close` / `reconcile_blocks_close`), reconcile cadence, partial
  settlement, carry-forward, custody escalation days, separation of duties.
  Seed available: `supabase/pilot/seed-day-close-demo.sql`.

**Verify** the seeded policy resolves as intended:
```sql
SELECT mode, supervisor_enabled, settle_enabled, settle_blocks_close,
       reconcile_enabled, reconcile_blocks_close, reconcile_cadence, auto_carry_forward
FROM erp_day_close_policies WHERE company_id = :'co';
SELECT erp_day_close_chain(:'co');  -- operational gating stages
SELECT mode, approver_role, backup_approver_role
FROM erp_return_approval_policies WHERE company_id = :'co';
```
- [ ] Day-close policy verified (recommended demo: Supervisor closes; Cash + weekly
  Inventory independent, non-blocking, carry-forward ON).
- [ ] Return policy verified.

---

## 3. Permissions to grant deliberately (NOT default)

These are **opt-in** by design. Assign to a named role/user before pilot, else the
surface is invisible:

| Permission | Who (typical) | Surface |
|---|---|---|
| `returns.override` | a senior approver (BM/Director) | Override Center → Returns |
| `day.close.override` | a senior approver | Override Center → Force close |
| `day.reopen` | a senior approver | Override Center → Reopen |
| `settings.workflow_policy` | Company Admin / IT Admin | Settings policy consoles |
| `cash.view_outstanding` | finance/settlement roles | cash on board/report |
| `customers.view_credit` | managers/finance | credit limit in Statement Hub |
| `audit.view` | compliance / auditor | Override History, audit |

- [ ] Override permissions assigned to a named approver (R/E: M3 onboarding step).
- [ ] `settings.workflow_policy` assigned to whoever configures policies.
- [ ] `cash.view_outstanding` / `customers.view_credit` assigned per the company's
      sensitivity rules.

---

## 4. Roles to assign

- [ ] **Salesman / Driver** — field reps (submit returns, submit End Day, custody).
- [ ] **Supervisor** — operational review + (if combined) reconcile/settle.
- [ ] **Warehouse** — Inventory Reconciliation (no cash visibility).
- [ ] **Cashier** — Financial Settlement (no credit-limit visibility).
- [ ] **Accountant** — settlement + financial reports.
- [ ] **Branch Manager** — approvals + (granted) override.
- [ ] **Company Admin** — policies, all.
- [ ] **Auditor** — read-only oversight (assign `auditor` role to the compliance
      user; now discoverable via the Reports nav group).

---

## 5. Navigation discoverability (post F1/F2)

Confirm each role sees its surfaces in the nav (no hidden pages):
- [ ] Salesman: My Returns, Customer Statements, Daily Summary, Cash Custody, Load Request.
- [ ] Supervisor/BM: Return Approvals, End Day Approvals/Settlement, Statements, Summary, **Reports group** (Return / Day-Close / Override History).
- [ ] Warehouse: End Day Approvals/Settlement (reconcile), Load Request.
- [ ] Cashier/Accountant: End Day Approvals/Settlement, Reports group.
- [ ] Auditor: **Reports group** (Return Report, Day-Close Report, Override History).
- [ ] Override holder: Override Center.

---

## 6. End-to-end smoke tests (per workflow)

- [ ] **Return** — create ≤500 saleable (auto-posts) and >500/damage (pending →
      approve → posted; reject → reason → My Returns shows rejected).
- [ ] **End Day** — submit (day locks, pending supervisor) → supervisor approve →
      day Closed while Cash = Partial / Inventory = Not Due Yet (non-blocking).
- [ ] **Partial settlement** — settle part of expected cash → outstanding recorded →
      next day Cash Custody shows carried custody + escalation if aged.
- [ ] **Reconciliation** — record count → variance recorded.
- [ ] **Override** — force approve a return / force close / reopen a closed day:
      each requires a reason and appears in Override History.
- [ ] **Reports** — Return / Day-Close reports show counts, outstanding aging, SLA;
      cash hidden for non-`cash.view_outstanding` users.
- [ ] **Permissions** — log in as each role; confirm visibility (credit hidden for
      salesman/cashier; cash hidden for warehouse; auditor read-only).

---

## 7. Sign-off

- [ ] No hidden pages (all routes reachable via nav per permissions).
- [ ] No orphan workflows (submit→approve→post / settle / reopen all wired).
- [ ] No backend-only capabilities (override/report/policy all surfaced).
- [ ] Audit trail verified (`erp_audit_logs` shows submit/approve/reject/settle/
      reconcile/override/reopen with actor + reason).
- [ ] Pilot owner sign-off: ____________________  Date: __________
