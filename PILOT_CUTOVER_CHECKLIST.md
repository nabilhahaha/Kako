# Pilot Cutover Checklist — Offline-First Sync & Reconciliation

Turnkey runbook for enabling the offline-safe sync subsystem (write seam, offline
UX, cloud mirror, `sync_rows → business tables` reconciliation, offline-order →
real-invoice materialization) for a **controlled pilot**.

- **Default state:** every part is **OFF** behind `KAKO_SYNC` and inert in production.
- **Scope of this cutover:** one pilot tenant on a preview/staging deployment.
- **Hard rule:** do **not** enable on the production project until Go/No-Go (§7) passes
  on the pilot.
- **Reference:** `docs/architecture/offline-first-sync.md` (§§1–19).

---

## 1. Prerequisites

- [ ] PR #125 merged (or deployed from its branch to the pilot environment).
- [ ] A dedicated **pilot Supabase project** (or a persistent branch) — **not** the
      production project. Schema must match production (the migrations below assume the
      `erp_*` schema is present).
- [ ] Admin access to the pilot's Vercel project (env vars + redeploys) and Supabase
      project (SQL editor / migration apply).
- [ ] One pilot **company**, at least one **branch**, one **warehouse with stock**, and
      one **salesman** user with branch membership + `market.pos` / `sales.sell`.
- [ ] A device/browser for the real offline pass (DevTools → Network → Offline).

---

## 2. Environment variables

Set on the **pilot deployment only**. ⚠ `NEXT_PUBLIC_*` are **inlined at build time** —
changing them requires a **redeploy/rebuild**, not just an env edit.

| Variable | Scope | Required | Value / Notes |
|---|---|---|---|
| `KAKO_SYNC` | Server (runtime) | ✅ | `1` to enable server routes/actions. Gate for all `/api/sync/*`. |
| `NEXT_PUBLIC_KAKO_SYNC` | Client (build-time) | ✅ | `1` to enable the offline UX + console. **Rebuild required.** |
| `SUPABASE_JWT_SECRET` | Server | ✅ (for offline **orders**) | Must equal the **pilot project's JWT secret** so minted impersonation tokens verify. Without it, order reconciliation fails closed (records stay retriable). |
| `CRON_SECRET` | Server | ✅ | Bearer secret for the cron routes (`/api/internal/sync-tick`, `/api/sync/reconcile`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | ✅ | Service-role key of the **pilot** project (worker reads mirror + writes ledger/audit). |
| `NEXT_PUBLIC_SUPABASE_URL` | Client/Server | ✅ | Points at the **pilot** project. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client/Server | ✅ | Pilot anon/publishable key. |

> Keep `KAKO_SYNC` and `NEXT_PUBLIC_KAKO_SYNC` **both** set. Server-on/client-off (or vice
> versa) is a half-enabled state: avoid it.

---

## 3. Feature flags

| Flag | Reads | Controls |
|---|---|---|
| `isSyncEnabledServer()` ← `KAKO_SYNC` | API routes, server actions, `submitOffline`/`submitOnlineOnly`, write-seam | Server behavior; routes 404 when off |
| `isSyncEnabledClient()` ← `NEXT_PUBLIC_KAKO_SYNC` | offline UX (error boundary, banner, nav guard), Sync console, badges | UI; everything no-ops when off |

**Kill switch:** set `KAKO_SYNC=0` (runtime, instant) to disable all server sync behavior
without a rebuild. The client flag needs a rebuild to fully remove the UI, but with the
server off the UI degrades to inert (writes pass through online-only).

---

## 4. Migration order

Migrations are **review-only** under `docs/architecture/sync/proposed-migrations/` (CI does
**not** auto-apply them). Apply to the **pilot DB only**, in order. Each is additive and
idempotent (`IF NOT EXISTS`).

| # | File | Adds | Depends on |
|---|---|---|---|
| 1 | `0001_sync.sql` | `sync_rows` mirror, `sync_ingest`, `sync_commit()`, feed index | — |
| 2 | `0002_sync_reconcile.sql` | `sync_reconcile` ledger, `sync_reconcile_log`, `sync_reconcile_due()`, `sync_reconcile_mark()`, RLS | 0001 |
| 3 | `0003_idempotency_guards.sql` | `uq_erp_invoices_idem`, `uq_erp_payments_idem` (partial unique) — confirmed present in prod; no-op where they exist | — |
| 4 | `0004_invoice_credit_review.sql` | `erp_invoices.requires_credit_review` + index | — |
| 5 | `0005_sync_impersonation_log.sql` | `sync_impersonation_log` + unique `jti` + RLS | — |

- [ ] Apply 0001 → 0002 → 0003 → 0004 → 0005 on the pilot DB.
- [ ] Verify `sync_review` exists if conflict-review is used (part of the 0001 family — confirm
      against the deployed sync console).
- [ ] Confirm `erp_user_company_id()` / `erp_has_branch_access()` exist (they back the RLS
      policies + impersonation authz). Present in the standard `erp_*` schema.

---

## 5. Deployment sequence (ordered)

1. [ ] Apply migrations 0001–0005 to the pilot DB (§4).
2. [ ] Set all env vars (§2) on the pilot deployment.
3. [ ] **Redeploy/rebuild** (so `NEXT_PUBLIC_KAKO_SYNC` inlines).
4. [ ] Confirm cron is registered (`vercel.json`): `/api/internal/sync-tick` and
       `/api/sync/reconcile`, every 15 min. Confirm `CRON_SECRET` matches.
5. [ ] Run smoke tests (§6). If any fail → **stop**, do not let pilot users on.

---

## 6. Smoke tests (post-deploy, before pilot users)

Run as the pilot admin/salesman on the pilot URL.

**Flag wiring**
- [ ] `GET /api/sync/reconcile/status` (logged in as admin) returns JSON counts (not 404).
      A 404 means `KAKO_SYNC` is off server-side.
- [ ] `settings/sync` console loads (admin) and shows the reconciliation panel.
- [ ] As a non-admin, `settings/sync` is 404 / not visible.

**Cron auth**
- [ ] `GET /api/sync/reconcile` **without** `Authorization: Bearer $CRON_SECRET` → 401.
- [ ] With the correct bearer → `{ ok: true, ... }`.

**Online path unchanged (regression)**
- [ ] Create + issue an invoice online; record a payment. Stock decrements, journal posts,
      receipt prints — exactly as today.

**Offline UX**
- [ ] Load a page, go offline (DevTools). App shows the offline banner, does **not** show the
      generic error boundary, and the nav guard keeps you on the loaded page.
- [ ] Reconnect → banner clears, pending count drains.

---

## 7. Pilot validation steps

End-to-end, on the pilot, with a real offline cycle.

**Operational offline-queue (should sync + materialize)**
- [ ] **POS sale offline:** add to cart → checkout while offline → "saved locally" toast, no
      crash. Reconnect → within ≤15 min (or via console "retry") a **real `erp_invoices` row**
      appears, issued + paid, stock decremented once, receipt printable.
- [ ] **Wholesale order offline** (within credit limit): same → real invoice, issued, balance
      updated.
- [ ] **Customer create/update, clinic visit, GPS check-in, field survey** offline → reconcile
      to their business tables; verify in the ledger (status `done`).

**Credit policy**
- [ ] Wholesale order offline for a customer **over** their credit limit → syncs as a **draft**
      flagged **"Credit review"** (badge visible in the invoices list; ledger `reason=credit-review`).
      **Not** rejected, **not** auto-posted.

**Stale price**
- [ ] Change a product's catalog price after an offline order was captured → the reconciled
      invoice uses the **captured** price, not the new one.

**Require-online (should block gracefully, never queue)**
- [ ] Offline attempt at: official invoice issue, payment/collection, financial return,
      stock-count finalize, attachment upload → inline "needs connection" message, form
      preserved, **nothing** written.

**Integrity / recovery**
- [ ] Force a reconcile failure (e.g., temporarily revoke the salesman's branch membership) →
      record goes `failed`, visible in the console with `last_error`, retriable; restore access
      → "retry" → `done`.
- [ ] Confirm `sync_impersonation_log` has one row per order materialization (audit trail).
- [ ] Re-run the cron twice → **no duplicate** invoices/payments (idempotency).

---

## 8. Go / No-Go criteria

**GO (all must hold):**
- [ ] All §6 smoke tests pass.
- [ ] All §7 validation steps pass.
- [ ] Zero duplicate invoices/payments across the pilot validation (query:
      `select idempotency_key, count(*) from erp_invoices where idempotency_key is not null group by 1 having count(*)>1` → empty; same for `erp_payments`).
- [ ] Stock ledger reconciles (no lost/double decrements) for every materialized order.
- [ ] Over-credit orders are flagged, never auto-posted; require-online flows never wrote offline.
- [ ] `sync_impersonation_log` audit complete; no token errors in logs.
- [ ] CI green on the deployed commit; `tsc` clean; full test suite passing.

**NO-GO (any triggers a stop + rollback §9):**
- [ ] Any duplicate financial row, or any stock/AR discrepancy.
- [ ] An over-credit order auto-posted, or a require-online flow written while offline.
- [ ] Reconciliation dead-letters pile up without a clear, fixable cause.
- [ ] Impersonation failures (missing/mis-set `SUPABASE_JWT_SECRET`) blocking order reconcile.
- [ ] Any regression in the **online** sales path.

---

## 9. Rollback procedures

Ordered least → most invasive. The flag kill-switch resolves almost everything.

1. **Instant disable (runtime):** set `KAKO_SYNC=0`. All `/api/sync/*` 404; server actions
   pass through online-only; the worker stops materializing. No rebuild needed. **Offline-
   queued data already in `sync_rows` is preserved** (re-enabling resumes reconciliation).
2. **Full UI disable:** also set `NEXT_PUBLIC_KAKO_SYNC=0` and **redeploy** to remove the
   offline UX/console from the bundle.
3. **Pause the worker only:** remove the `/api/sync/reconcile` entry from `vercel.json` (or
   unset `CRON_SECRET`) — mirror keeps filling, materialization pauses; safe to resume.
4. **Data already materialized:** invoices created by reconciliation are normal `erp_invoices`
   — reverse via the existing **void/return** workflows (never delete rows). Over-credit drafts
   can be cancelled via the standard draft-cancel path.
5. **Migration rollback (last resort, pilot DB only):** the additive tables/columns are inert
   when the flag is off, so prefer leaving them. If removal is required, use the documented
   `Down` notes in each migration file (drop functions then tables; drop the
   `requires_credit_review` column; drop the unique idem indexes only if they did not pre-exist).

> The mirror (`sync_rows`) and ledger are **append/journal** stores — rolling back the flag
> never destroys captured offline data; it just pauses processing.

---

## 10. Production rollout plan (post-successful pilot)

Phased, reversible at each step.

- **Phase 0 — Review & sign-off:** financial-integrity assessment (§ reconciliation in the
  design doc) + this checklist's pilot results reviewed by the owner/finance.
- **Phase 1 — Migrations:** apply 0001–0005 to **production** in a maintenance window
  (additive; safe with the flag off). Verify `uq_*_idem` indexes are present (0003 is a no-op
  if so). Keep `KAKO_SYNC` **off** — production behavior is unchanged.
- **Phase 2 — Server on, single tenant:** set `SUPABASE_JWT_SECRET`, `CRON_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`; enable `KAKO_SYNC=1` (runtime) but keep `NEXT_PUBLIC_KAKO_SYNC`
  **off** — back-end ready, no user-facing offline UI yet. Watch the reconcile cron + audit
  logs for 24–48h with synthetic orders.
- **Phase 3 — One pilot store:** set `NEXT_PUBLIC_KAKO_SYNC=1` + rebuild for the cohort; onboard
  one real store/route. Daily: check the reconcile console (dead-letters, credit-review queue),
  duplicate-invoice query (must stay empty), stock variance.
- **Phase 4 — Ramp:** widen to more stores in cohorts; keep the kill switch (`KAKO_SYNC=0`)
  one toggle away. Add the binary/blob outbox for offline photos before relying on field
  attachments offline (currently require-online).
- **Phase 5 — GA:** default-on after a clean ramp; document the operator runbook (console,
  retry, credit review, JWT-secret rotation in lockstep).

**Ongoing ownership / monitoring:**
- Reconcile dead-letter count (alert if > 0 sustained).
- Duplicate-financial query (must always be empty).
- `sync_impersonation_log` review (security).
- JWT secret rotation: rotate `SUPABASE_JWT_SECRET` **in lockstep** with the project JWT secret.

---

## Appendix — artifact map

- **Flag:** `src/lib/sync/flag.ts`
- **Write path:** `src/lib/sync/web/{write-seam,submit-offline}.ts`, orchestrator + outbox
- **Server contract:** `src/lib/sync/server/{apply,reconcile,reconcile-deps,impersonate}.ts`,
  `supabase-deps.ts`
- **Routes:** `/api/sync/push`, `/api/sync/review`, `/api/sync/backup`,
  `/api/sync/reconcile` (cron), `/api/sync/reconcile/status`, `/api/sync/reconcile/retry`,
  `/api/internal/sync-tick` (cron)
- **Console:** `settings/sync` → `src/components/sync/sync-console.tsx`
- **Migrations:** `docs/architecture/sync/proposed-migrations/0001…0005`
- **Cron schedule:** `vercel.json`
- **Design doc:** `docs/architecture/offline-first-sync.md`
