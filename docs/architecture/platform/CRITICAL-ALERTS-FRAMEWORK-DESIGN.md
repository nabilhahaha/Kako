# Critical Alerts Framework — platform design

**Status:** Design (implementing in phases) · **Flag:** `KAKO_ALERTS` (default OFF)

A **platform-level alert engine** — not a module feature. Any module registers an alert
**source**; tenants configure **rules** (thresholds, recipients, channels, severity); the
engine evaluates on a schedule, raises **alert instances** with a full
open→acknowledge→snooze→resolve lifecycle, dispatches role-based notifications (in-app now;
email/WhatsApp/SMS via adapter registrations), and audits everything. Built entirely on
existing infrastructure (notifications, role resolution, cron, events, audit, RLS).

---

## 1. Principles

1. **Metadata-driven** — alert rules (source, severity, thresholds, recipients, channels)
   are configuration: global defaults + **per-company overrides**. No hardcoded thresholds.
2. **Reusable sources** — each alert type is a registered evaluator (`registerAlertSource`)
   any module contributes; the engine has no per-source branches.
3. **Reuse, don't reinvent** — `erp_notify` (+ its `channel` column), `erp_workflow_resolve_users`
   (role→users), the `CRON_SECRET` + service-client tick pattern, `erp_events` dedupe, `erp_log_audit`.
4. **Lifecycle-first** — every alert has open/acknowledged/snoozed/resolved + audit; dedupe
   prevents alert storms.
5. **Flag-gated, default OFF** — inert until `KAKO_ALERTS`; no tenant enabled without approval.

---

## 2. Architecture

```
 module registers a SOURCE  ──▶ alert source registry (code)
                                        │ evaluate(db, rule, company) → candidates
 tenant configures RULES  ──▶ erp_alert_rules (global default + per-company override)
                                        │
 cron /api/internal/alerts-tick (CRON_SECRET + service role, no-op while OFF)
   for each active rule × company:
     candidates = source.evaluate(...)              (reads existing tables)
     upsert erp_alerts by dedupe_key                (open / refresh; auto-resolve gone ones)
     recipients = resolveRecipients(rule)           (erp_workflow_resolve_users)
     dispatch: erp_notify (in_app) + channel adapters (email/whatsapp/sms — registrations)
     audit: alert.raised
   lifecycle actions (UI/API): acknowledge / snooze / resolve → audit
```

---

## 3. Data model

### `erp_alert_rules` — metadata (global default `company_id IS NULL` + per-company override)

| Column | Notes |
|---|---|
| `id` uuid pk · `company_id` uuid null | null = global default |
| `rule_key` text | e.g. `low_stock`, `credit_overdue` |
| `source_key` text | the registered source to evaluate |
| `severity` text | `info`\|`warning`\|`high`\|`critical` |
| `threshold` jsonb | source-specific config (e.g. `{days:30}`, `{pct:15}`) |
| `recipient_type` text · `recipient_ref` text | `role`/`company_admin`/`user`/`permission` + ref |
| `channels` jsonb | `["in_app"]` (+ `email`/`whatsapp`/`sms` later) |
| `snooze_default_hours` int · `is_active` bool | |
| stamps | company trigger, updated_at |

UNIQUE `(company_id, rule_key)` + partial-unique `(rule_key) WHERE company_id IS NULL`. RLS:
read global + own company; write company admin (globals seeded by migration).

### `erp_alerts` — instances (lifecycle)

| Column | Notes |
|---|---|
| `id` uuid pk · `company_id` uuid | tenant |
| `rule_key` · `source_key` · `severity` | denormalized from the rule at raise time |
| `status` text | `open`\|`acknowledged`\|`snoozed`\|`resolved` |
| `entity` · `record_id` | the subject (e.g. customer/product/task) |
| `dedupe_key` text | UNIQUE `(company_id, dedupe_key)` — one live alert per condition |
| `title` · `body` · `payload` jsonb | snapshot of the condition |
| `acknowledged_by/at` · `snoozed_until` · `resolved_by/at` · `resolved_reason` | lifecycle |
| stamps | |

Indexes: `(company_id, status, severity)`, `(company_id, dedupe_key)` unique. RLS: tenant-scoped.

---

## 4. Source registry (the extensibility seam)

`src/lib/alerts/sources.ts`:

```ts
interface AlertSource {
  key: string;
  evaluate(deps, rule, companyId): Promise<AlertCandidate[]>;   // reads existing tables
}
registerAlertSource(source);   // modules call at import — no engine change
```

`AlertCandidate = { dedupeKey, entity, recordId, severity?, title, body, payload }`. The
engine upserts candidates into `erp_alerts` (open/refresh), and **auto-resolves** previously
open alerts for a rule whose condition no longer fires (`resolved_reason='cleared'`).

---

## 5. Recipients & dispatch

- **Recipients** — `resolveRecipients(rule)` reuses `erp_workflow_resolve_users(company, recipient_type, recipient_ref)` (role/company_admin/user). Permission-based recipients resolve via the permission→roles→users path.
- **In-app** — `erp_notify(...)` per recipient (existing; bilingual title/body, link to the alert).
- **Channel adapters** — `registerAlertChannel('email'|'whatsapp'|'sms', adapter)`; the dispatcher calls adapters listed in `rule.channels`. Ship an **email stub** now; real providers are registrations (same seam as the CR external hooks). The `erp_notifications.channel` column already anticipates this.

---

## 6. Lifecycle

```
 (cron raises) open ──acknowledge──▶ acknowledged ──resolve──▶ resolved
        │  └──snooze(until)──▶ snoozed ──(until passes / re-fires)──▶ open
        └── condition clears (cron) ─────────────────────────────▶ resolved (cleared)
```

Every transition writes `erp_log_audit` (`alert.raise|acknowledge|snooze|resolve`). Dedupe
ensures a still-firing condition refreshes the existing alert rather than spamming.

---

## 7. Severity & evaluation

- Severity per rule (`info/warning/high/critical`); a source may raise a higher severity from
  its payload (e.g. credit far over limit → critical).
- Evaluation: `/api/internal/alerts-tick` (CRON_SECRET + service client), every ~15 min,
  **no-op while `KAKO_ALERTS` OFF**. Per company × active rule → evaluate → upsert → dispatch.

---

## 8. Initial sources — guardrail split

**Ready on existing data (build now):**

| Source | Reads |
|---|---|
| `pending_approvals` | `erp_workflow_tasks`(pending) + instances |
| `overdue_requests` | `erp_workflow_tasks` past `due_at` (SLA) |
| `low_stock` | `erp_inventory_stock` vs `erp_products_catalog.min_stock` |
| `failed_integrations` | `erp_integrations` (`last_test_ok`/stale) + webhook `dead` |
| `credit_overdue` | `erp_customers`(limit/balance) + `erp_invoices`(overdue) + `erp_credit_block_rules` |
| `high_discount_variance` | `erp_invoice_lines`/`erp_invoices` discount vs rule `threshold.pct` (config, not a new column) |

**Need NEW columns on existing tables → HIGH-RISK, deferred pending owner approval:**

| Source | Missing |
|---|---|
| `near_expiry_stock` | batch/lot + `expiry_date` (no expiry model today) |
| `route_violation` / `gps_mismatch` | `erp_visits` GPS coords, `out_of_route`, route geofence |

These are designed-for (just register the source + add the columns), but adding columns to
existing operational tables is exactly the kind of change I will **pause and ask** about
before doing — it touches the live inventory/visit data model.

---

## 9. Security / RLS

- RLS on `erp_alert_rules` (global read + tenant write) and `erp_alerts` (tenant-scoped).
- The cron uses the **service role** and sets `company_id` explicitly per row (tenant isolation
  in the handler). Sources read tenant data scoped by `company_id` filters.
- No existing RLS/auth/permission changed; recipients reuse the proven workflow resolver.
- Flag-gated; cron + any channel route are `CRON_SECRET`/secret-authed and inert while OFF.

---

## 10. Feature flag & rollout

`KAKO_ALERTS` (default OFF). Global rules are seeded inactive/sensible defaults; a tenant turns
on the capability (pilot) only with explicit approval. Mirrors the Change Request rollout.

---

## 11. Phased PR roadmap

| PR | Scope |
|---|---|
| **0** | *This design doc.* |
| **A1** | Schema (`erp_alert_rules`, `erp_alerts`), flag, types, **source + channel registries**, recipients resolver (pure where possible) + tests. |
| **A2** | Cron evaluator (`/api/internal/alerts-tick`) + upsert/auto-resolve + dispatch (in_app + email stub) + audit; integration tests. |
| **A3** | Ready sources: pending_approvals, overdue_requests, low_stock, failed_integrations, credit_overdue, high_discount_variance (+ seed global rules, inactive) + tests. |
| **A4** | Lifecycle actions (acknowledge / snooze / resolve) + audit + tests. |
| **A5** | Alerts UI (list + filters + lifecycle actions), flag-gated. |
| **A6** | Email channel adapter seam hardening; WhatsApp/SMS documented as registrations. |
| **A7 (gated)** | Schema-dependent sources (near_expiry_stock, route/GPS) — **only after owner approves the column additions**. |
| **A8** | Pilot enablement guide + readiness. |

Each PR additive, flag-gated (`KAKO_ALERTS` OFF), CI-green, with tests. No tenant enabled.

---

## 12. Open decisions

1. **Schema-dependent sources (A7)** — OK to add `expiry_date`/batch to inventory and GPS/geofence
   to `erp_visits` later (additive, nullable), or keep those sources out of scope? *(Pause point.)*
2. **Rule config UI vs seed-only** — start with seeded global rules + per-company overrides via
   data, add a rules admin UI later? *(Recommend: yes.)*
