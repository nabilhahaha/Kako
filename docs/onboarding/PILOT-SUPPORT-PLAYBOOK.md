# Pilot Support Playbook

How to support the distributor through the first pilot — daily cadence, triage,
common issues with fixes, escalation, and the one-switch rollback. The FMCG loop
is **atomic, idempotent, and non-destructive**, so almost every field issue is
recoverable in-app.

---

## 1. Support model & cadence

| When | Who | Focus |
|---|---|---|
| **Go-live day** | On-site/▶on-call support | Shadow the rep's first full day; confirm every sale/collection/return goes through the app. |
| **Week 1, daily** | Supervisor + support | Day-end reconciliation, AR/stock accuracy, coverage, adoption. |
| **Week 2–4, daily→weekly** | Supervisor | Trends, exceptions, taper support as adoption stabilizes. |

**Daily standup checklist (5 min):** Did every rep open + close their day? Any
unreconciled sessions? Any negative-stock or over-credit rejections? Any
off-book (paper) transactions? Any printing/connectivity complaints?

## 2. Day-1 operations (what "good" looks like)

The rep's day, each step prints/shares (**never auto-prints**):
open day → confirm van load → visit (GPS) → **sell** (`INV-…`) → **collect**
(`COL-…`, oldest-first) → **return + reason** (`RET-…` + credit note) →
**reconcile** (supervisor/warehouse-keeper) → **close day**. Full table:
[`../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md` §4](../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md#4-pilot-day-1-operations-guide).

## 3. Week-1 monitoring targets

| Metric | Target | Where |
|---|---|---|
| Stock accuracy | ≥ 99% | Day-end reconciliation variance |
| AR / balance accuracy | 100% consistent | Customer statement vs invoices − collections − credits |
| In-app sales | ≥ 95% of route sales | Invoices vs reported sales |
| Returns via system | 100% with a reason | Returns + reason completeness |
| Day-close compliance | 100% closed + reconciled | Closed sessions / day |
| Adoption | all reps daily | Active reps / day |

Full guide: [`PILOT-LAUNCH-PACKAGE.md` §5](../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md#5-pilot-week-1-monitoring-guide).

## 4. Common issues → fixes (Tier-1, field-resolvable)

| Symptom | Likely cause | Resolution |
|---|---|---|
| "No van assigned" on sell/return | van missing `is_van`/assignment | Assign the rep's van; retry. → [Van Setup](./VAN-SETUP-GUIDE.md) |
| Sell rejected `over_credit` | balance + net > credit limit | Collect first, or raise the limit. |
| Sell rejected `insufficient_van_stock` | overselling the van | Load/transfer stock, or sell available qty. |
| Sale resolves **price 0** | SKU `sell_price ≤ 0` / no rule | Fix the SKU price. → [Pricing Setup](./PRICING-SETUP-GUIDE.md) |
| Discount rejected | over `discount_cap_pct` | Apply within cap, or supervisor adjusts the cap. |
| Reconciliation "not authorized" | run by the rep | Run as **supervisor/warehouse-keeper**. |
| Customer can't be sold to | pending approval | Approve the customer (admin/manager). |
| Duplicate tap / flaky network | retry | **Idempotency key** ⇒ no double document; the repeat returns the same one. |
| Wrong amount/reason on a posted doc | data entry | Use a **return + credit note** (sale) or corrective collection — never edit balances by hand. |
| Connectivity drop mid-day | online-first | Cart kept; resume on reconnect (offline queue = Phase 6). |

Detailed recovery: [`PILOT-LAUNCH-PACKAGE.md` §6](../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md#6-pilot-failure-recovery-guide).

## 5. Escalation

| Tier | Owner | Scope | Action |
|---|---|---|---|
| **T1 — Field** | Supervisor | The table in §4 | Resolve on the spot; log the document number. |
| **T2 — Admin** | Company admin | Master data / pricing / roles / approvals / activation | Fix config (price, credit, role, van assignment, toggle). |
| **T3 — Platform** | VANTORA support | Suspected platform defect | Capture **document number + error token + audit log** (`erp_audit_logs`) and the steps to reproduce; raise to engineering. **Do not mutate balances/stock directly.** |

**What to collect for any escalation:** company + branch, user + role, the
document number, the exact error token, timestamp, and whether a retry was made.

## 6. Rollback (instant, non-destructive)

1. **Pause the module:** unset `KAKO_VAN_SALES` (env) **or** set
   `erp_van_sales_settings.is_enabled = false` → all van-sales surfaces go
   inert/hidden; nothing is deleted; issued documents stay valid.
2. **Per-rep pause:** unassign the rep's van (`assigned_to = null`).
3. **Re-enable:** flip the flag/toggle back on — the module resumes as before.

There is **no migration to revert** for a pause. Full guide:
[`PILOT-LAUNCH-PACKAGE.md` §7](../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md#7-pilot-rollback-guide).

## 7. Health checks the support team can run (staging)

- **Regression:** `reference-activity-and-validate.sql` → `all 109 role/permission
  assertions passed` confirms roles/visibility intact.
- **Loop integrity:** `run-pilot-dry-run.sql` → `ALL CHECKS PASSED`.
- See [`../architecture/fmcg/REGRESSION-VALIDATION-GUIDE.md`](../architecture/fmcg/REGRESSION-VALIDATION-GUIDE.md).

## 8. Exit criteria — pilot → steady state

- [ ] ≥ 95% in-app sales, 100% day-close + reconciliation for 5 consecutive days.
- [ ] Stock accuracy ≥ 99%; AR 100% consistent; zero cross-tenant incidents.
- [ ] Reps operating independently; supervisor owns reconciliation.
- [ ] No open T3 issues. → Proceed to broader rollout / next branch.
