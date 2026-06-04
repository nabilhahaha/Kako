# Operations Checklists (definitive)

> The single source for the four operational checklists. Prepared `2026-06-04`.
> Post-hotfix context: `0118` applied, invoicing restored; residual drift open.

---

## A. Day-1 Operations Guide (administrators)

**Access & roles**
- Roles/permissions live in **Settings → Authorization Console** (changes
  invalidate the Copilot cache automatically). `admin`/`manager` hold the full
  permission union after `0142`.

**Daily**
- Watch Vercel production status + runtime logs (500s, failed RPCs).
- Watch invoice + payment creation success (the recovered path).
- Review **Confusion Analytics** (`/platform/copilot-analytics`) for confusing screens.
- Confirm the daily backup workflow is green (~02:00 UTC). **Enable PITR** (see plan).

**Support quick answers**
- "Inventory tab 404" → fixed (points to `/inventory`).
- "Can't create invoice" → `0118` is applied; if a stale *schema cache* error,
  reissue `NOTIFY pgrst, 'reload schema'`.
- "Can't do X" → Copilot **Why can't I…?** gives the exact blocker + remedy.

**Escalation**
- DB/migration issues → `runbooks/MIGRATION-DRIFT-REMEDIATION.md`; never run
  `migrate-production` against prod. Always back up before any schema change.

---

## B. UAT Checklist (business users)

**Sales rep / field**
- [ ] Create a customer; create + issue an invoice; collect a payment.
- [ ] Today's Journey: GPS check-in; record order/no-order; end day.

**Manager / supervisor**
- [ ] Approve a pending visit / day-close / transfer.
- [ ] Sales Summary + Journey Compliance figures correct.

**FMCG Wave 1**
- [ ] UOM (carton = N pieces); price resolves per unit/qty.
- [ ] Target → achievement %; van reconciliation settle/reject; returns by reason;
      credit-limit request → approve.

**Admin**
- [ ] Authorization Console grant/revoke takes effect.
- [ ] Copilot answers a screen / why-blocked question (AR + EN).

- [ ] **Business sign-off recorded** (name, date, scope).

---

## C. Production Monitoring Checklist

- [ ] Invoice + payment creation success rate (recovered path).
- [ ] Error rate / latency nominal; no failed-RPC spike.
- [ ] No `idempotency` / `schema cache` errors in logs.
- [ ] `get_advisors` security + performance — no new ERROR.
- [ ] Daily backup green; PITR status (target: ON).
- [ ] Row counts trend normally; no unexpected drops.
- [ ] Tenant isolation spot-check (scoped user sees only own rows).
- [ ] Vercel production deployment READY on the current release commit.

---

## D. Post-Deployment Validation Checklist

**Smoke (within 15 min)**
- [ ] App loads; login AR + EN.
- [ ] **Create an invoice** → success.
- [ ] Record a payment → success; balance correct; idempotent on retry.
- [ ] Customers / Products / Sales / Inventory render (no 500s).
- [ ] Mobile bottom-nav **Inventory** → `/inventory` (no 404).

**Integrity**
- [ ] Row counts ≥ baseline; no loss.
- [ ] `get_advisors` security + performance — no new ERROR.

**Authz / tenancy**
- [ ] Scoped user sees only own customers/transactions.
- [ ] Company admin sees own company only (no cross-tenant).

**Observability**
- [ ] Error rate / latency nominal for 60 min.
