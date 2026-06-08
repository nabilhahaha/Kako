# Phase 8E — Notification Center: Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive ·
multi-tenant RLS · governance + audit · flag default OFF (`KAKO_NOTIFICATION_CENTER`).

## 1. Architecture & intent
A unified, multi-channel **notification preferences + delivery + history** layer over the existing
`erp_notifications` table (already surfaced in the top-bar bell and `/notifications`). 8E adds
**per-user/role preferences**, **channel routing** (in-app · email · webhook/WhatsApp via the
Integration Hub), **templates**, and **digest/quiet-hours** — not a new notification primitive.

## 2. Reuse vs net-new
- **Reuse:** `erp_notifications` (storage + bell + list), the workflow `notification` step, the
  dispatcher + egress rules (outbound), and Integration Hub (Phase 6) connectors for email/
  WhatsApp. The Step 2 structured-logging/alerting layer for operational alerts (distinct from
  user notifications).
- **Net-new:** preference + template + channel-routing config, a delivery-attempt log, and a
  richer notification-center UI (filters, mark-all-read, categories).

## 3. Data model (additive)
- `erp_notification_prefs` (`company_id, user_id?, role_key?, category, channel, enabled,
  quiet_hours`), `erp_notification_templates` (`company_id?, code, channel, subject, body, locale`),
  `erp_notification_deliveries` (`notification_id, channel, status, attempts, last_error,
  delivered_at`). Company-scoped RLS; FK-covering indexes. `erp_notifications` reused as the
  canonical event; deliveries fan out from it.

## 4. Forms / Field-Governance compatibility
Templates render only fields the recipient's role may view (governance-aware substitution) — no
sensitive-field leakage in notifications. N/A for forms beyond template variables.

## 5. Mobile / Offline
In-app notifications already work on the mobile shell (bell). Push (web-push) is a **later
optional channel**; not in the initial scope. Offline: unread notifications sync naturally on
reconnect (read-only); no offline write concern.

## 6. Audit / Security / Multi-tenant
Delivery attempts + preference changes audited. Outbound channels reuse egress allow-listing
(no SSRF / arbitrary endpoints). Company-scoped RLS; a user only ever sees their own
notifications/prefs; cross-tenant isolation via RLS.

## 7. Integration
Email/WhatsApp/webhook delivery routes through the Integration Hub + dispatcher (existing). No new
transport; 8E configures routing, the Hub executes it.

## 8. Phasing / Risks / Non-goals
- **8E-1** preferences + center UI over existing notifications. **8E-2** templates + channel
  routing via the dispatcher. **8E-3** delivery log + retry (reuse the Step 2 retry/backoff idea).
- **Risk:** notification spam / fan-out cost → digest + quiet-hours + per-category opt-out.
  **Risk:** PII in templates → governance-aware rendering + redaction.
- **Non-goals:** not a marketing-campaign engine; not a new outbound transport; web-push deferred.

**Recommendation:** proceed behind `KAKO_NOTIFICATION_CENTER` (OFF); ~60% reuse (notifications +
dispatcher + Hub). Await approval.
