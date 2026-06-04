# Pilot Operations Manual

*For the operations owner running the controlled FMCG pilot. Self-contained — no engineering required for routine operations. Read-only DB checks are safe; anything that changes data/infra follows the escalation matrix. Complements `PILOT-EXECUTION-PLAYBOOK.md` and `DEPLOYMENT-PLAYBOOK.md`.*

**Tools you'll use:** Supabase dashboard (DB, Auth, Backups, Logs) · Vercel dashboard (deploys, function logs) · Sentry (errors) · the app itself (admin login) · the pilot support channel.
**Golden rules:** never edit/delete production data directly · never run seed/demo scripts on production · read-only first · when unsure, escalate.

---

## 1. Daily operations checklist (~10 min, each morning)
- [ ] **App up:** open the app + uptime monitor — pilot URL loads, login works.
- [ ] **Sentry:** any new/elevated errors in the last 24h? Triage; raise P1/P2 per §3.
- [ ] **Supabase health:** Database → check CPU, connections, disk; Logs → **slow-query log** (note any query > 500 ms).
- [ ] **Vercel:** latest deployment = "Ready"; no spike in function errors.
- [ ] **Backups:** Supabase → Database → Backups — a backup completed in the last 24h; PITR window healthy (§5).
- [ ] **Workflow/approvals:** approvals inbox isn't stuck (ask the pilot admin or check the `/approvals` count); no items aging > 1 day unexpectedly.
- [ ] **Support channel:** triage overnight messages; acknowledge within SLA (§9).
- [ ] Log the check (date, who, anomalies) in the ops log.

## 2. Weekly operations checklist
- [ ] **Usage:** active users, counts of orders/invoices/payments (read-only query or dashboard) — trending as expected?
- [ ] **Data growth:** sizes of `erp_audit_logs`, `erp_notifications`, `erp_workflow_tasks` — note growth (retention jobs are a 🟠 backlog item; flag if growing fast).
- [ ] **Performance:** review the week's slow-query log; confirm list p95 < 500 ms; flag any tenant approaching data limits.
- [ ] **Backups:** confirm 7 daily backups exist; **run the weekly backup-verification** (§5).
- [ ] **Security:** scan audit log for unusual actions (mass deletes, permission grants); any RLS-denial spikes in logs.
- [ ] **Feedback:** summarize pilot feedback; groom the 🟠 backlog with eng.
- [ ] **Incidents:** review the week's incidents + follow-ups closed.

## 3. Incident response process
**Severity:**
| Sev | Definition | Response target | Comms |
|---|---|---|---|
| **P1** | App down · login broken · data loss/corruption · cross-tenant leakage | **Immediate**, escalate to eng now | Notify pilot admin + stakeholders |
| **P2** | Core flow blocked for users (can't invoice/collect) · severe slowness | **≤ 2 h** | Notify pilot admin |
| **P3** | Single-user issue · cosmetic · enhancement | **next business day** | Log only |

**Steps:** 1) **Detect** (Sentry/monitor/report). 2) **Triage** severity. 3) **Capture** evidence (screenshots, error id, time, affected user/tenant, recent deploy/migration). 4) **Contain** (e.g., app rollback per §10/rollback checklist) — only the documented safe actions; else escalate. 5) **Communicate** per the table. 6) **Resolve / escalate** (§4). 7) **Verify** (smoke + the affected flow). 8) **Post-incident note** (cause, fix, follow-up).

## 4. Escalation matrix
| Level | Who | Owns | Escalate when |
|---|---|---|---|
| **L1 — Ops** (this manual) | Pilot ops owner | Daily/weekly checks, triage, comms, app rollback, backup verify | Anything beyond documented safe actions |
| **L2 — On-call Engineer** | Eng on-call | Migrations, schema, code fixes, PITR restore, perf | Data/schema change, P1/P2 not resolved by L1 |
| **L3 — Platform / DB owner** | Platform lead | Production DB, secrets, infra, DR decision | Data loss/corruption, security incident, restore decision |
> Fill in names/contacts/working-hours + an after-hours path before go-live. Target: L1→L2 within the P-sev response window.

## 5. Backup verification process
**Daily (quick):** Supabase → Database → Backups — confirm last automated backup < 24h old; PITR enabled + retention window (e.g., 7 days) intact.
**Weekly (verify):**
- [ ] Confirm 7 consecutive daily backups present.
- [ ] Confirm PITR earliest-recoverable timestamp is within retention.
- [ ] Record results in the ops log (date, latest backup ts, PITR window).
- [ ] If a backup is missing/failed → **P2 → escalate L2/L3** (backups are a release gate).

## 6. Restore verification process (drill — quarterly, never on production)
- [ ] L2/L3 creates a **Supabase branch / clone restored** from the latest backup (or PITR to a chosen timestamp).
- [ ] Verify on the clone: row counts on `erp_customers`, `erp_invoices`, `erp_payments` match expectations; `supabase_migrations` history present; the app **boots and lists render** against the clone.
- [ ] Record **RTO** (time to usable restore) and confirm **RPO** (data-loss window) vs targets (RTO ≤ 2h, RPO ≤ 5 min).
- [ ] Document any deviation; do **not** point production at the clone (drill only).
- **Real DR (P1):** L3 decision → PITR restore to last-good timestamp → verify → cutover → comms. Follow the Rollback Checklist.

## 7. Monitoring dashboard checklist
- [ ] **Sentry:** error-rate + new-issue alerts enabled → ops channel; release health visible.
- [ ] **Supabase:** alerts on DB CPU, connection saturation, disk; slow-query log accessible; Auth error rate.
- [ ] **Vercel:** deployment status + function error/latency; alert on failed deploys.
- [ ] **Uptime monitor:** pilot URL + a health route, alert on downtime.
- [ ] **Business pulse (weekly):** orders/invoices/payments counts, active users — a simple saved query/dashboard.
- [ ] All alerts route to the **ops channel** with an after-hours path for P1.

## 8. Support playbook
**Triage funnel:** Acknowledge → reproduce → classify (bug / how-to / data / enhancement) → severity (§3) → resolve or escalate → verify with the user → close + log.
**L1 self-serve tools (read-only / permissioned admin):**
- Confirm a user's role/branch in Settings → Users.
- Check a customer's `approval_status` / `customer_status` / credit on the Customer 360.
- Check the approvals inbox for stuck tasks.
- Check audit log (platform) for "who changed what".
- Re-send/retry an import for the user (per-entity CSV) after fixing the file.
**Do NOT (escalate instead):** edit DB rows directly, change RLS/permissions globally, run migrations, restore backups.

## 9. Pilot customer support process
- **Channel:** the shared pilot channel (chat) + a ticket log.
- **SLA (pilot):** acknowledge P1 immediately, P2 ≤ 2h, P3 next business day; daily presence during go-live week.
- **Intake template:** who (user/role), what they did, what happened vs expected, time, screenshot/error id, tenant.
- **Resolution:** fix via self-serve tools where possible; else escalate (§4) with the captured evidence.
- **Follow-up:** confirm the fix with the user; log the issue + theme; feed recurring themes into the weekly backlog grooming.
- **Weekly summary** to the pilot admin: issues opened/closed, themes, upcoming changes.

## 10. Common failure scenarios & recovery steps
| Symptom | Likely cause | L1 action | Escalate if |
|---|---|---|---|
| App down / 500s | Bad Vercel deploy | **Roll back to previous Vercel deployment** (≤15 min); verify | not resolved by rollback → L2 (P1) |
| Login fails for everyone | Supabase Auth / env keys | Check Supabase status + that keys/env are present (Vercel env) | keys OK but still failing → L2 (P1) |
| Lists slow / timing out | Large tenant data / missing index | Check slow-query log; confirm **0110 indexes applied**; ask user to use search/filters | persistent > 500ms → L2 (perf) |
| "Can't create order/invoice" | Customer not approved, **suspended/blocked**, or **over credit limit** | Check Customer 360: `approval_status`, `customer_status`, balance vs limit; approve or change status (if permissioned + policy allows). **Collections still work by design.** | needs status/credit policy change beyond ops → admin/L2 |
| Approval stuck | No eligible approver / missing permission | Check workflow task; ensure an approver holds `customers.approve`; assign/grant (admin) | engine error → L2 |
| Payment/collection blocked | (should never be) | Confirm — payments are **never** status-gated; if blocked it's a bug | any block → L2 (P1, contradicts design) |
| Import errors | Validation failures (dup code, missing required, bad FK) | Return the error report; have user fix the file; re-import. To undo a bad batch: delete by code prefix (admin/L2) — **Import Center rollback is roadmap** | large/ambiguous cleanup → L2 |
| Attachment upload fails | Type/size limit (JPG/PNG 10MB, PDF 20MB, DOCX/XLSX 10MB) or storage quota | Check file type/size; advise user | quota/storage issue → L2 |
| Suspected cross-tenant data | RLS concern | **STOP — P1.** Capture exact evidence; escalate L3 immediately; do not poke further | always (P1) |
| Migration/deploy failure | Schema apply error | Do **not** retry blindly; escalate L2; consider PITR per rollback | always (P1/P2) |
| Data loss / corruption | Various | **P1 → L3**: PITR restore to last-good timestamp; comms | always (P1) |

---

## Quick reference
- **Rollback app:** Vercel → Deployments → previous "Ready" → Promote (≤15 min).
- **RTO/RPO:** ≤ 2h / ≤ 5 min (PITR).
- **Migration high-water mark:** 0117.
- **Never:** edit applied migrations · run seeds on prod · direct prod data edits · global permission/RLS changes without L2/L3.

*Operations manual only. No merge, no production deployment, no production migrations.*
