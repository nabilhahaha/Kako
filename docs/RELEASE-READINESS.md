# Kako — Release Readiness Report

> **Documentation, validation & release-prep only.** No code, no migrations, no
> production change is introduced by this report. Prepared `2026-06-04`.
> Audience: release approver + operators. Companion docs: `EXECUTIVE-SUMMARY.md`,
> `runbooks/HOTFIX-INVOICING.md`, `runbooks/MIGRATION-DRIFT-REMEDIATION.md`.

> **🟢 STATUS UPDATE — 2026-06-04 (post-hotfix):** Migration **`0118` was applied
> and validated; production invoicing is RESTORED**. **`0109` and the full
> 43-migration drift package were NOT applied** (remaining drift still open →
> close later via staging). **No AI enabled** (`COPILOT_AI_ENABLED` OFF). Updated
> **Platform health: 92/100**; **invoicing gap (was #1/Top-10) is CLOSED**. The
> scores/gaps below reflect the pre-hotfix snapshot and are superseded by this
> banner + the Stabilization Report (`STABILIZATION-REPORT.md`). Execution
> record: `runbooks/EXECUTE-0118.md`.

---

## 0. Release at a glance

| Scores (0–100) | Now | Rationale |
| --- | --- | --- |
| **Platform health** | **72** | Code excellent & green; one **active production outage** (invoicing) with a ready, low-risk fix. Jumps to ~95 once `0118` is applied. |
| **Production readiness** | **78** | Hotfix verified & low-risk; full drift closure still gated on a staging dry-run + a tracking-convention decision; deploy tooling needs hardening. |
| **AI readiness** | **40** | Deterministic Ask-Copilot V1 complete, safe, tested, flag-OFF. No LLM integrated/evaluated yet (intentional); Arabic quality unmeasured. |

**Go/No-Go headline:** **GO** to restore invoicing via the verified `0118`
hotfix (operator-run, after backup) and to merge the green core PRs on review.
**NO-GO** for `db push` / `migrate-production` against the live DB and for
enabling the AI flag before production is stable.

---

## 1. PR verification — all green

| PR | Scope | CI | Draft | Mergeable | base ← head |
| --- | --- | --- | --- | --- | --- |
| **#98** | FMCG Value Acceleration Wave 1 | ✅ CI/E2E/Migrate | ready | clean | `claude/enterprise-readiness` ← `claude/fmcg-value-wave1` |
| **#99** | Bug-hunt hotfix + remediation package + exec summary | ✅ | ready | clean | `claude/fmcg-value-wave1` ← `claude/fmcg-bug-hunt` |
| **#100** | AI strategy (roadmap doc) | ✅ | draft | (recomputing) | `claude/fmcg-bug-hunt` ← `claude/ai-strategy` |
| **#101** | Copilot AI V1 (flag-OFF) | ✅ | draft | clean | `claude/fmcg-bug-hunt` ← `claude/copilot-ai-v1` |

**⚠️ Release-path note:** the PRs are **stacked on feature branches, not `main`**.
The chain is `main → enterprise-readiness → fmcg-value-wave1 (#98) →
fmcg-bug-hunt (#99) → {ai-strategy #100, copilot-ai-v1 #101}`. Before deploy,
decide either to **merge the chain down in order** or **retarget #98 (and the
chain) to `main`**. #98 and #99 are the release-critical PRs; #100/#101 are the
AI track (not required to restore invoicing).

**Merge-ready verdict:** #98 and #99 are **merge-ready** (green, un-drafted,
clean). #100/#101 are green but intentionally **draft** (AI track parked).

---

## 2. Deployment checklist (single)

> Code deploy is **separate** from the DB hotfix. Deploying code alone does NOT
> restore invoicing — the `0118` DB step (§4) is the gating fix.

- [ ] Confirm release scope = #98 (Wave 1) + #99 (bug-hunt + inventory 404 fix). AI PRs (#100/#101) excluded from this release or merged flag-OFF.
- [ ] Resolve the base-branch path (§1): merge chain in order, or retarget to `main`.
- [ ] All target PRs green on the merge commit (re-check CI after any rebase).
- [ ] Tag/record the release commit SHA.
- [ ] **Backup complete** (§3) and PITR confirmed ON.
- [ ] **Apply the invoicing hotfix** (§4) — `0118` — and validate (§4).
- [ ] Trigger the Vercel production deployment of the release commit; confirm `READY`.
- [ ] Smoke-test production (§6) within 15 min of deploy.
- [ ] Announce completion + monitoring window to stakeholders.
- [ ] **Do NOT** run `supabase db push` or the `migrate-production` workflow.

---

## 3. Production backup checklist (single)

- [ ] **PITR ON** — Supabase → Project Settings → Database → Point in Time Recovery; **record the current recovery timestamp** (primary rollback anchor).
- [ ] **On-demand dump** — Actions → *Database backup* (`scripts/backup.sh`, `--no-owner --no-privileges`, custom format); confirm the run is green and the artifact/S3 object exists. Label `pre-release-<UTC>`.
- [ ] **Baseline snapshot** (read-only) recorded outside the DB:
  - invoices = 123 · payments = 47 · customers = 52 · last invoice = `2026-06-01`
  - `select count(*) from supabase_migrations.schema_migrations;`
- [ ] Backup artifact location + decryption key (if `BACKUP_GPG_*` set) noted by the operator.
- [ ] (Recommended) verify the dump restores into a throwaway DB (restore drill, `docs/BACKUPS.md`).

---

## 4. Invoicing hotfix checklist (single — migration `0118`)

> Restores invoicing. Additive, ~10 min, **zero behaviour change**. `0118` alone
> clears the incident; `0109` optional per the approved bundle. Operator-run.
> Full detail: `runbooks/HOTFIX-INVOICING.md`.

**Pre-flight**
- [ ] §3 backup complete; PITR timestamp recorded.
- [ ] Confirm dependencies present (verified `2026-06-04`): `erp_invoices`, `erp_payments`, `erp_payment_method`, `erp_has_branch_access`. ✅

**Apply (explicit, transaction-wrapped — never `db push`/`migrate-production`)**
- [ ] `psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/0118_payment_invoice_idempotency.sql`
- [ ] (Optional) apply `0109_customer_approval.sql` the same way.
- [ ] Record in `schema_migrations` per the chosen tracking convention.

**Validate (must pass)**
- [ ] `erp_invoices.idempotency_key` + `erp_payments.idempotency_key` exist (uuid).
- [ ] Unique partial indexes `uq_erp_invoices_idem`, `uq_erp_payments_idem` exist.
- [ ] `erp_record_payment` resolves with 6 args (5-arg call still works).
- [ ] **Create a real invoice from the app** → succeeds (new row dated today).
- [ ] Same `idempotency_key` twice → exactly one invoice/payment.

---

## 5. Rollback checklist (single)

> Preferred = PITR. Targeted reverse only if the apply itself failed.

- [ ] **Decision:** apply failed or post-deploy regression? → choose mechanism.
- [ ] **PITR restore** (preferred) to the §3 timestamp — consistent schema + data.
- [ ] **Targeted reverse of `0118`** (if isolated): drop `uq_erp_*_idem` indexes; drop `idempotency_key` columns; (restore 5-arg `erp_record_payment` from `0007` if fully reverting). ⚠️ Re-breaks invoicing — only if needed.
- [ ] **Targeted reverse of `0109`** (if applied): per `runbooks/HOTFIX-INVOICING.md` §5.
- [ ] **App rollback:** Vercel → redeploy the previous `READY` production deployment.
- [ ] Remove the `schema_migrations` rows added during apply.
- [ ] Re-run §6 smoke test to confirm the rollback is healthy.
- [ ] Record incident notes (what failed, mechanism used, time-to-recover).

---

## 6. Post-deployment validation checklist (single)

**Smoke (within 15 min)**
- [ ] App loads; login works (AR + EN).
- [ ] **Create an invoice** → success (the headline fix).
- [ ] Record a payment → success; balance correct; idempotent on retry.
- [ ] Customers / Products / Sales / Inventory screens render (no 500s).
- [ ] Mobile bottom-nav **Inventory** tab opens `/inventory` (no 404 — bug-hunt fix).

**Integrity**
- [ ] Row counts ≥ baseline (§3); no data loss.
- [ ] `get_advisors` (security) — no new ERROR/WARN.
- [ ] `get_advisors` (performance) — no missing-index regressions.

**Multi-tenant / authz**
- [ ] A scoped user (salesman) sees only their own customers/transactions.
- [ ] A company admin sees their company only (no cross-tenant leakage).

**Observability**
- [ ] Error rate / latency nominal for 60 min post-deploy.
- [ ] No spike in failed RPCs in logs.

---

## 7. UAT checklist (business users)

> Run on the production (or a production-like) build with real roles. Sign-off
> by a business owner before broad rollout.

**Sales rep / field**
- [ ] Create a customer; create + issue an invoice; collect a payment.
- [ ] Today's Journey: GPS check-in; record order/no-order; end day.

**Manager / supervisor**
- [ ] Approve a pending visit / day-close / transfer.
- [ ] Review Sales Summary + Journey Compliance figures look correct.

**FMCG Wave 1**
- [ ] Add a UOM (e.g., carton = 12); confirm price resolves per unit/qty.
- [ ] Create a target; verify achievement %.
- [ ] Run a van reconciliation; settle/reject.
- [ ] Returns analysis by reason; credit-limit request → approve.

**Admin**
- [ ] Authorization Console: grant/revoke a capability; verify it takes effect.
- [ ] Help Copilot answers a screen/why-blocked question correctly (AR + EN).

- [ ] **Business sign-off recorded** (name, date, scope tested).

---

## 8. Day-1 Operations Guide (administrators)

**Access & roles**
- Manage roles/permissions in **Settings → Authorization Console** (live; changes invalidate the Copilot cache automatically).
- `admin`/`manager` hold the full permission union (Wave-0 + Wave-1) after `0142`.

**Daily monitoring**
- Watch the Vercel deployment status + runtime logs for 500s / failed RPCs.
- Watch invoice/payment creation success (the recently-fixed path).
- Review **Confusion Analytics** (`/platform/copilot-analytics`) for screens generating the most questions → targeted training/UX.

**Backups & recovery**
- Daily automated backup runs ~02:00 UTC (`.github/workflows/backup.yml`); confirm green.
- PITR is the first recovery tool; `scripts/restore.sh` is the portable fallback (`docs/BACKUPS.md`).

**Common support answers**
- "Inventory tab 404" → fixed in this release (points to `/inventory`).
- "Can't create invoice" → ensure `0118` is applied (this release).
- "Can't do X" → Copilot **Why can't I…?** explains the exact permission/module/scope blocker + remedy.

**Escalation**
- DB/migration issues → follow `runbooks/MIGRATION-DRIFT-REMEDIATION.md`; never run `migrate-production` against the live DB.
- Keep a fresh backup before any schema change.

---

## 9. Known Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Invoicing stays down if code deploys without `0118` | High if skipped | Critical | §4 hotfix is a hard gate in the deploy checklist (§2). |
| R2 | Operator runs `migrate-production`/`db push` → mid-run halt | Medium | High | Documented **NO-GO**; one-file explicit apply only. |
| R3 | Large residual drift (43 migrations) causes future "column missing" errors | Medium | High | Staged full closure (§ roadmap) after a staging dry-run. |
| R4 | `schema_migrations` version-scheme mismatch confuses tooling | Medium | Medium | Pick a tracking convention before full closure (drift runbook §6). |
| R5 | RLS/authz cutover (full closure) changes visibility | Low (hotfix) | Medium | Hotfix is additive/zero-impact; full closure validated on staging first. |
| R6 | Backup/PITR not actually enabled | Low | Critical | §3 makes PITR confirmation a hard pre-flight gate. |
| R7 | Stacked PRs merged out of order / wrong base | Medium | Medium | §1 merge-order note; re-run CI on merge commits. |
| R8 | AI flag enabled prematurely | Low | Medium | Default OFF; no LLM wired; gated behind stability; fallback safe. |
| R9 | Van reconciliation records variance but doesn't post stock adjustments | Known | Low–Med | Documented as Wave-1 foundation; follow-on wave. |
| R10 | No load/perf testing on new FMCG screens | Medium | Low–Med | Monitor latency Day-1; perf pass in next cycle. |

---

## 10. Top 10 remaining gaps

1. **Invoicing outage not yet remediated** — `0118` ready, awaiting operator apply.
2. **Production schema drift** — 43 migrations (`0099`,`0100`,`0103`–`0143`) unapplied.
3. **`migrate-production` workflow is unsafe** — blind full replay; needs a drift-safe rewrite (apply-pending-only).
4. **`schema_migrations` version-scheme inconsistency** — tracking-convention decision pending.
5. **No deploy gate** preventing app code shipping ahead of its migration (the systemic root cause of this incident).
6. **PRs stacked on feature branches, not `main`** — release merge path undefined.
7. **Full drift closure not yet dry-run** on a staging / PITR-restored copy.
8. **Backup/PITR status unconfirmed** by operator (must verify enabled before deploy).
9. **AI LLM not integrated/evaluated** — Arabic quality unmeasured; flag-OFF (acceptable, but a gap to "AI ready").
10. **No formal UAT sign-off / owner approval** recorded yet for this release.

---

## 11. Recommended roadmap (after invoicing restoration)

1. **Stabilise** — confirm invoicing healthy 24–48h; watch advisors + logs.
2. **Close the full drift** — staging/PITR-copy dry-run → ordered apply of the 43 missing files (excl. `0101`/`0102`) → verify `db push` reports zero pending.
3. **Harden the pipeline (prevent recurrence)** — rewrite `migrate-production` to apply only pending/idempotent migrations; add a deploy gate so code can't ship ahead of its migration; standardise the `schema_migrations` convention.
4. **Merge & deploy the core** — land #98 + #99 to `main`; confirm production parity.
5. **UAT + Day-1 ops** — business sign-off; monitoring window.
6. **AI Phase 2 (opt-in)** — register a free-tier LLM provider in a preview, run the Arabic/English eval against `erp_copilot_queries`, enable gradually (flag + per-company); deterministic fallback stays.
7. **FMCG functional follow-ons (future wave, not now)** — van-reconciliation stock posting, commission, AR/credit integration, route/replenishment.

---

*Release package — documentation, validation, and preparation only. No code was
written, no migration created, and no production change made.*
