# FMCG Pilot Launch Package

Everything the pilot team needs to run the real-user pilot. The FMCG foundation is
**frozen and feature-complete**; this phase collects **pilot feedback only** — no new
features, no architecture changes. Companion docs: `Per-Role-Validation-Runbook-2026`
(step scripts), `Pilot-Validation-Execution-Report-2026` (runtime evidence + GO).

**Readiness:** GO (approved). V1 deployed-closed; **D1 fixed globally** (migration
`0334`); V2/V3 accepted as documented pilot risks.

---

## 1. Login credentials

Pilot tenant **`VANTORA Pilot FMCG (DEMO)`** (`612af0bd-973c-4fed-8e76-80cf444ef9e0`)
on staging. All accounts password **`test.123`** (change before any external exposure).

| # | Role | Login |
|---|---|---|
| 1 | Company Admin | `admin@pilot.test` |
| 2 | Branch Manager | `branchmgr@pilot.test` |
| 3 | Supervisor | `supervisor@pilot.test` |
| 4 | Warehouse Keeper | `warehouse@pilot.test` |
| 5 | Cashier | `cashier@pilot.test` |
| 6 | Accountant | `accountant@pilot.test` |
| 7 | Salesman | `salesman@pilot.test` |
| 8 | Auditor | `auditor@pilot.test` |

Master data seeded: 1 branch (PILOT) + main & van warehouse, 8 FMCG products with
stock, 11 customers with credit limits/balances. Flags ON: return approval (+SLA),
day-close approval (+SLA). Policies: Return = approval (Supervisor→BM; damage→BM,
saleable ≤500→auto); Day-Close = Supervisor closes, Cash settlement + weekly Inventory
reconciliation independent & non-blocking, carry-forward ON.

---

## 2. Role matrix (validated at runtime — 112/112)

✓ = granted · — = denied. Mutating capability shown; read/oversight implied where noted.

| Capability | Sales­man | Super­visor | Ware­house | Cash­ier | Account­ant | Auditor | Branch Mgr | Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Field sell / collect | ✓ | — | — | ✓ | collect | — | ✓ | ✓ |
| Create return | ✓ | ✓ | — | — | — | — | ✓ | ✓ |
| **Approve return** | — | ✓ | — | — | — | — | ✓ | ✓ |
| Submit End Day | ✓ | — | — | — | — | — | — | ✓ |
| **Approve/close day (Supervisor)** | — | ✓ | — | — | — | — | ✓ | ✓ |
| **Inventory reconciliation** | — | ✓ | ✓ | — | — | — | ✓ | ✓ |
| **Cash settlement** | — | ✓ | — | ✓ | ✓ | — | ✓ | ✓ |
| See cash / custody | — | ✓ | — | ✓ | ✓ | ✓(read) | ✓ | ✓ |
| See customer credit limit | — | ✓ | — | — | ✓ | ✓(read) | ✓ | ✓ |
| **Override / reopen** | — | — | — | — | — | — | — | ✓ |
| View reports | — | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |
| Audit trail | — | — | — | — | — | ✓ | — | ✓ |
| Edit policies / flags | — | — | — | — | — | — | — | ✓ |

Notes: Override/reopen is **apex-only** (Company Admin); a Branch Manager can be granted
it deliberately (Override Center). Auditor is strictly **read + export** (no mutations).
Warehouse never sees cash; Cashier never sees credit limit.

---

## 3. Pilot checklist (run per role)

Execute the full per-role scripts in `Per-Role-Validation-Runbook-2026` (§3). Daily loop:

- [ ] **Admin** — confirm policies/flags; (optional) grant Override to a named approver.
- [ ] **Salesman** — sell, collect, create returns (auto ≤500 + approval >500/damage),
      submit End Day (locks, NOT closed), check Cash Custody card.
- [ ] **Supervisor** — approve/reject returns; approve End Day → day **Closed** while
      cash/inventory remain pending (non-blocking); review Reports.
- [ ] **Warehouse** — reconcile the day's stock (variance carries forward); no cash visible.
- [ ] **Cashier** — settle cash (full + **partial → carry-forward**); confirm outstanding
      surfaces as next-day custody.
- [ ] **Accountant** — settle + reconcile day-close outstanding to Aging/reports.
- [ ] **Branch Manager** — branch-scope approvals; confirm NO Settings/Override by default.
- [ ] **Auditor** — read-only: open all reports + Override History; confirm **no action
      buttons**; trace one return + one day-close end-to-end; verify audit trail.
- [ ] **Cross-cutting** — sidebar matches the role; direct-URL to a hidden page redirects;
      ar/en + mobile usable for field roles.

Run the loop **2–3 business days** so carry-forward custody + escalation badges accrue.

---

## 4. Known limitations (accepted for pilot)

| ID | Sev | Limitation | Mitigation during pilot |
|---|---|---|---|
| **V2** | Medium | `erp_van_return` / `erp_decide_van_return` lack the DB `erp_guard_rpc`; a direct PostgREST call can bypass return permissions. **UI path is fully gated** by the server action (`requireActionPermission('returns.approve')`). | Pilot is UI-only; no direct RPC access. Post-pilot fix queued. |
| **V3** | Medium | `loadDayCloseReview` / `loadPendingDayCloses` show cash unmasked to a reconcile-only (Warehouse) user inside the day-close review. | Brief warehouse users; post-pilot mask fix queued. |
| **N2** | Note | Authenticated UI **screenshots** were not capturable in the build environment (no egress). Runtime DB validation is the evidence of record; visual confirmation is part of this pilot's manual pass. | Pilot team confirms visuals via §3. |
| ~~V1~~ | — | Day-close direct-RPC bypass. | **Closed** (migration `0333`, verified). |
| ~~D1~~ | — | Auditor role missing from DB catalog. | **Closed** (migration `0334`, verified — 11 read-only perms). |

Post-pilot backlog also carries L1–L4 (see Pilot-Readiness-Audit) and V2/V3/V4–V7
(see Implementation-Verification-Audit). **None block the pilot.**

---

## 5. Defect capture template

One row per finding. Tag focus area: Usability / Navigation / Permission / Reporting /
Workflow.

| Field | Entry |
|---|---|
| **ID** | DF-___ |
| **Role** | (Salesman / Supervisor / Warehouse / Cashier / Accountant / Auditor / Branch Mgr / Admin) |
| **Screen** | (page / route) |
| **Action** | (what the tester did) |
| **Expected** | (per role matrix / runbook) |
| **Actual** | (what happened) |
| **Severity** | Blocker / High / Medium / Low |
| **Screenshot** | (attach / link) |
| **Recommendation** | (proposed fix + in-pilot vs post-pilot) |

**Disposition rule (freeze intact):** fix in pilot only usability copy, nav
visibility/labels, i18n, a missing button wiring an *existing* action, or a missing
column on an *existing* report. Anything needing a new module/workflow/schema/policy →
log post-pilot; do not build mid-pilot.

---

## 6. GO / NO-GO sign-off sheet

| # | Gate | Status |
|---|---|---|
| G1 | 8 role accounts provisioned & reachable | ☑ (done) |
| G2 | Authorization matrix validated (112/112) | ☑ (runtime) |
| G3 | Day-close / settlement / reconciliation workflow validated (10/10) | ☑ (runtime) |
| G4 | Audit trail complete & actor-attributed | ☑ (runtime) |
| G5 | RLS tenant isolation (no cross-tenant leakage) | ☑ (runtime) |
| G6 | V1 closed; **D1 closed globally** | ☑ (0333, 0334) |
| G7 | V2 / V3 accepted & documented as pilot risks | ☑ |
| G8 | Manual UI pass (sidebar / direct-URL / masking render) | ☐ pilot team |
| G9 | ar/en + mobile usability for field roles | ☐ pilot team |
| G10 | Defects logged with disposition; freeze respected | ☐ ongoing |

**Decision:** GO ☑ / NO-GO ☐  

Pilot Owner: ______________________  Signature: ______________  Date: __________

Technical Lead: ____________________  Signature: ______________  Date: __________

---

*Foundation frozen as of this package. Pilot phase = feedback only.*
