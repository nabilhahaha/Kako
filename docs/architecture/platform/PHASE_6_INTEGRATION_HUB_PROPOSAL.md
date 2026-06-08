# VANTORA — Phase 6: Universal Integration Hub (Architecture Proposal & Roadmap)

**Status:** 🔵 **Design review / proposal + roadmap only — NO implementation, NO
migrations, NO code.** Platform-wide capability (not FMCG-specific). Builds on the
**substantial integration foundation already in production** — Phase 6 formalizes it into
a Universal Integration Hub, adds the remaining connectors + a mapping engine + unified
monitoring + a connector marketplace. **Authority e-invoice connectors (ETA/ZATCA) remain
PAUSED** (no certs/credentials) and are out of Phase 6 scope.
**Discipline:** reuse-first · additive-only · RLS · auditability · flags default OFF ·
integration tests before merge · multi-tenant safety.

---

## 0. What already exists (reuse baseline — do NOT rebuild)
| Capability | Existing |
|---|---|
| Connector runtimes | generic-REST, CSV/SFTP, Dynamics BC, NetSuite, Odoo, SAP S/4 (`src/lib/erp/connectors/runtime/*`) + OAuth1/OAuth2/OData helpers |
| Connector registry + presets | `connectors/registry.ts`, SAP/NetSuite/Odoo presets |
| Connections / credentials | `erp_integration_connections`, `erp_integration_api_keys`, credential encryption (`integration-crypto.ts`) |
| Webhooks | `erp_webhooks` |
| Sync engine | `erp_sync_jobs` / `erp_sync_runs` + RPCs (`erp_sync_claim_due/complete/job_*`) + Vercel cron `sync-tick` (claim → pull/push → ingest → finalise, retry) |
| Ingest + mapping | `integration-ingest.ts` (idempotent, company-scoped upsert) + entity registry (`entities.ts`) driving column mapping/validation; `field_map` per job |
| Import wizard | `/settings/import` CSV/XLSX/JSON → map → validate → preview → import; `erp_import_jobs` audit |
| Audit | `erp_integration_logs`, `erp_import_jobs` |
| UI | `/settings/integrations/{connections,api-keys,webhooks,sync}`, `/settings/data-onboarding` |

**Implication:** the **Connector Framework (goal 1)** and **Multi-tenant design (goal 3)**
are ~80% present. Phase 6 mainly adds connectors, a first-class mapping engine, unified
monitoring, and the marketplace — additively.

## 1. Connector Framework (goal 1)
- **Registry/lifecycle** — formalize a `Connector` descriptor (id, category, capabilities
  in/out, auth kind, config schema, presets) on the existing `connectors/registry.ts`;
  lifecycle `configured → enabled → syncing → paused → error → disabled` already mirrored
  by `erp_integration_connections.status` + sync run states.
- **Configuration** — per-connection config (already JSON) + a typed config schema per
  connector for validation/UI.
- **Credential management** — reuse `integration-crypto.ts` (encrypt at rest) + secret
  storage (env/KMS); never plaintext in DB. OAuth flows reuse `oauth2.ts`.
- **Health monitoring / retry / audit** — reuse `erp_sync_runs` (status/attempts/cursor)
  + `erp_integration_logs`; retry/backoff already in `sync-tick`. Phase 6 adds a unified
  health read-model + dashboard.

## 2. Supported connector categories (goal 2)
| Category | Connector | Status |
|---|---|---|
| ERP | SAP S/4 | ✅ exists (runtime) |
| ERP | SAP Business One | ➕ add (REST/Service Layer adapter; reuse generic-REST + a B1 preset) |
| ERP | Microsoft Dynamics 365 (F&O/CE) | ➕ add (Dataverse/OData; reuse OData + Dynamics-BC patterns) |
| ERP | Oracle (Fusion/EBS) | ➕ add (REST/OData adapter + preset) |
| ERP | NetSuite | ✅ exists |
| ERP | Odoo | ✅ exists |
| Accounting | QuickBooks Online | ➕ add (OAuth2 REST + preset) |
| Accounting | Xero | ➕ add (OAuth2 REST + preset) |
| Accounting | Zoho Books | ➕ add (OAuth2 REST + preset) |
| Distribution/FMCG | SalesBuzz | ➕ add (REST/file adapter + preset) |
| Distribution/FMCG | Foodics | ➕ add (OAuth2 REST + preset) |
| Commerce | Shopify | ➕ add (OAuth2 REST + webhooks) |
| Commerce | WooCommerce | ➕ add (REST + webhooks) |
| Data | Excel / CSV | ✅ exists (import wizard + csv-sftp) |
| Data | Google Sheets | ➕ add (OAuth2 Sheets API adapter) |
| Generic | REST APIs | ✅ exists (generic-REST) |
| Generic | Webhooks | ✅ exists (`erp_webhooks`) — formalize inbound/outbound |

Every new connector = a **preset + runtime adapter** on the existing pattern (pull/push +
`field_map` + ingest). **No core change per connector** — same extensibility as Search /
tax packs / industry packs.

## 3. Multi-tenant design (goal 3)
Already per-company: `erp_integration_connections.company_id` (RLS), per-company
credentials (encrypted), per-company `field_map` on `erp_sync_jobs`, per-company schedules
(`erp_sync_jobs` cron/cursor). Phase 6 keeps this; the marketplace adds per-company
**enable/disable** + entitlement (tie to plan/module).

## 4. Mapping Engine (goal 4)
- Reuse the **entity registry** (`entities.ts`) + `field_map`. Phase 6 adds a first-class,
  reusable **mapping model + resolver** per entity: customer / product / invoice / order /
  tax / warehouse — bidirectional (external↔VANTORA), with value transforms + a
  **code-cross-reference table** (`erp_integration_xref`: external_id ↔ internal_id per
  connection + entity) so re-syncs are stable and idempotent.
- Tax mapping integrates with the Phase-5 tax codes/profiles; product/customer/warehouse
  map to existing masters. Pure mapping resolver (testable) + a mapping UI.

## 5. Monitoring (goal 5)
A unified **Integration Health** read-model + dashboard over `erp_sync_runs` /
`erp_integration_logs`: per-connector health, last sync, failed syncs, retry queue depth,
error logs — reusing the KPI/StatCard + read-model pattern from Phase 3.x. Pure rollups;
RLS-scoped.

## 6. Connector Marketplace (goal 6)
- A **catalog** of available connectors (the registry) + per-company **enable/disable**
  (`erp_company_connectors`: company_id, connector_id, enabled, entitlement). Reuses the
  module/capability + role-governance patterns. A connector appears in a tenant's hub only
  when enabled (and entitled by plan). Architecture supports third-party/partner connectors
  later (signed connector manifest), same Platform+Pack model.

---

## 7. Roadmap (phased, each additive, flag-gated `KAKO_INTEGRATION_HUB`, reviewed)
| Sub-phase | Scope |
|---|---|
| **6A — Hub framework formalization** | Connector descriptor/registry hardening + typed config schema + unified status lifecycle + the `erp_integration_xref` cross-reference model. (Mostly formalizing what exists.) |
| **6B — Mapping engine** | Pure per-entity mapping model + resolver (customer/product/invoice/order/tax/warehouse) + mapping UI. |
| **6C — Monitoring** | Integration Health read-model + dashboard (health/last-sync/failures/retry/errors). |
| **6D — Marketplace** | `erp_company_connectors` enable/disable + catalog UI + entitlement. |
| **6E — Connector packs** | Add adapters incrementally: accounting (QuickBooks/Xero/Zoho), commerce (Shopify/WooCommerce), ERP (SAP B1/Dynamics 365/Oracle), FMCG (SalesBuzz/Foodics), Google Sheets, webhooks formalization — each its own flagged increment + integration tests. |

Recommended order: **6A → 6B → 6C → 6D → 6E** (framework + mapping + monitoring + marketplace
first; then connectors land one-by-one on the hardened framework). Within 6E, sequence by
demand (e.g. QuickBooks/Xero, Shopify, Foodics early for the target market).

## 8. Risks
- **Credential security** — OAuth token storage/refresh + encryption; reuse `integration-crypto`
  + KMS; never plaintext. (Same posture as the paused tax connectors.)
- **Rate limits / pagination** — per-connector; handled in each runtime adapter (existing
  pattern has cursors/backoff).
- **Mapping correctness / idempotency** — the xref table + dedupe keys prevent duplicates on
  re-sync; heavy unit tests on the mapping resolver.
- **Schema drift at sources** — versioned presets + validation; a failing connector is
  isolated (per-tenant, per-connection) and never blocks others.
- **Marketplace entitlement** — must not bypass plan/module gating or RLS.

## 9. Dependencies
- Existing connector runtimes + sync engine + ingest + entity registry + crypto (**present**).
- Phase-5 tax codes/profiles (for tax mapping) — present.
- Jobs/tick (scheduling), `erp_integration_logs`/`erp_sync_runs` (audit/health) — present.
- External: OAuth apps/API keys per third-party (tenant-provided at enablement; no platform
  certs needed, unlike the paused authority connectors).

## 10. Estimated complexity
| Sub-phase | Complexity |
|---|---|
| 6A framework formalization + xref | Medium (mostly consolidation) |
| 6B mapping engine | Medium-High (pure resolver + UI; correctness-sensitive) |
| 6C monitoring | Low-Medium (read-model + dashboard) |
| 6D marketplace | Medium (enable/disable + entitlement) |
| 6E connectors | Medium each (per adapter; ~12 connectors → the bulk over time) |

## 11. Recommended implementation order
1. **6A** xref + descriptor/config hardening (pure + additive migration `erp_integration_xref`).
2. **6B** pure mapping resolver (entity mapping) + tests, then mapping UI.
3. **6C** health read-model + dashboard (inert/flag-OFF).
4. **6D** `erp_company_connectors` + marketplace enable/disable.
5. **6E** connectors incrementally (accounting → commerce → ERP → FMCG → Sheets/webhooks),
   each flagged, with integration tests before merge.

Each sub-phase: additive migrations, `KAKO_INTEGRATION_HUB` (+ per-connector flags) OFF,
RLS + audit, reuse the existing runtimes/sync/ingest, integration tests before merge — same
discipline as Phases 1–5.

---

## Platform backlog (roadmap — review later, NOT in Phase 6 scope)
- **`VIEW_AS_ROLE`** — let an admin preview the app as another role (read-only impersonation
  of the effective-permission set; ties into the Role-Template-Governance resolver). Audit
  every view-as session.
- **`ACT_AS_USER`** (future) — full delegated impersonation (act on behalf of a user);
  higher-risk — requires explicit audit, consent/policy, and a hard multi-tenant boundary.
  Reviewed as its own architecture proposal before any build.

*Design review only — no code, migrations, or schema changes in this document. On approval,
Phase 6A begins under the same engineering discipline. ETA/ZATCA authority connectors remain
paused pending credentials.*
