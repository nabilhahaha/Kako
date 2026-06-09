# Critical Alerts Framework — pilot enablement guide

How to safely pilot the alert engine, validate it, monitor it, and roll back. Ships
**OFF by default** behind `KAKO_ALERTS`; no tenant raises alerts until you enable it.
See `CRITICAL-ALERTS-FRAMEWORK-DESIGN.md`.

> **Approval gate:** do not enable in a shared/production environment until approved.
> Nothing here enables a tenant.

---

## 0. Enablement model

One platform flag, `KAKO_ALERTS`. Rules are seeded as **global** metadata, so when the
flag is ON the engine evaluates them for every tenant in that environment. The engine is
**behaviorally inert** until the cron runs against active rules. For a controlled pilot,
enable in a **dedicated environment** (one tenant); to pilot inside a shared environment,
deactivate the global rules and create per-company rules for the pilot company only (or
add a per-company enablement gate first).

---

## 1. Environment configuration

| Variable | Purpose | Required |
|---|---|---|
| `KAKO_ALERTS=1` | Master switch — evaluator, `/alerts` UI, lifecycle actions | **Yes** |
| `CRON_SECRET` | Authorizes the `/api/internal/alerts-tick` evaluator | **Yes** |
| service-role key | The evaluator runs with the service client | Already set |

The evaluator cron (`/api/internal/alerts-tick`, every 15 min) is already in `vercel.json`;
it is a **no-op while the flag is OFF** and begins raising/resolving alerts once ON. Redeploy
after setting the flag.

---

## 2. Rules, sources & recipients (in place)

- **Sources shipped:** `pending_approvals`, `overdue_requests`, `credit_limit`, `low_stock`.
- **Global rules** (severity / threshold / recipients / channels) are seeded; a company
  overrides any rule by inserting its own `erp_alert_rules` row with the same `rule_key`
  (company-specific thresholds/severity/recipients win over the global default).
- **Recipients** resolve via the existing role→users path (`company_admin` / `role` /
  `user`). Defaults: approvals→admins, overdue→admins, credit→`manager`, low stock→`warehouse_keeper`.
- **Channels:** `in_app` (live, via the notification centre). `email`/`whatsapp`/`sms` are
  adapter **seams** — register a provider adapter to enable them (a real email/SMS provider
  is a separate dependency decision; the `email` adapter currently ships as a stub).

Deferred sources (not in this pilot): near-expiry stock and route/GPS violations need new
columns on existing operational tables — a separate, approved schema effort. Failed
integrations + high discount variance are fast-follow registrations.

---

## 3. Pre-go-live validation checklist

- [ ] `KAKO_ALERTS=1` + `CRON_SECRET` set in the pilot env; redeployed.
- [ ] `/alerts` renders (flag ON) and is empty initially.
- [ ] **Low stock:** set a product's `min_stock` above its on-hand → next evaluator tick
      raises a `low_stock` alert; recipients get an in-app notification.
- [ ] **Credit limit:** a customer with `balance > credit_limit` raises `credit_limit`
      (critical when ≥ limit×1.25).
- [ ] **Overdue/pending approvals:** a pending workflow task past its `due_at` raises
      `overdue_requests`; one pending beyond the grace window raises `pending_approvals`.
- [ ] **Dedupe:** the same condition does not create duplicate alerts across ticks.
- [ ] **Auto-resolve:** fix the condition (restock / settle / decide) → next tick marks the
      alert `resolved` (reason `cleared`).
- [ ] **Lifecycle:** Acknowledge / Snooze (24h) / Resolve on `/alerts` persist + audit;
      a snoozed alert returns to view after its timer.
- [ ] **Tenant isolation:** another company sees none of the pilot company's alerts.

Sign off when every box passes.

---

## 4. Rollback

- **Stop everything:** unset `KAKO_ALERTS` and redeploy → the evaluator, `/alerts`, and
  lifecycle actions go inert. Existing alert rows remain (history); no new ones are raised.
- **Quiet one rule:** set its `erp_alert_rules.is_active = false` (per company or globally).
- **Clear noise:** resolve open alerts on `/alerts` (audited).
All non-destructive; alert rows are records, not operational data.

---

## 5. Monitoring checklist

- [ ] **`/alerts`** — open/critical counts; nothing stuck unacknowledged.
- [ ] **Evaluator** — the tick returns raised/refreshed/resolved counts; a flat zero with
      known conditions ⇒ cron not running (check `CRON_SECRET`/schedule) or rules inactive.
- [ ] **Notifications** — recipients receive in-app notifications (the notification centre).
- [ ] **Audit** — `alert.raise/acknowledge/snooze/resolve` rows present.
- [ ] **Volume** — if a rule is too chatty, raise its threshold or lower its severity
      (per-company override) rather than disabling globally.

---

## Quick reference

| Item | Value |
|---|---|
| Flag | `KAKO_ALERTS` (default OFF) |
| Evaluator | `/api/internal/alerts-tick` (every 15 min, `CRON_SECRET`) |
| UI | `/alerts` (list + acknowledge/snooze/resolve) |
| Rules | `erp_alert_rules` (global defaults + per-company overrides) |
| Instances | `erp_alerts` (open/acknowledged/snoozed/resolved, deduped) |
| Sources | pending_approvals, overdue_requests, credit_limit, low_stock |
| Channels | in_app (live) · email/whatsapp/sms (adapter seams) |
| Rollback | unset `KAKO_ALERTS` → inert |
