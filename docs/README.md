# VANTORA Business OS — Documentation Index

> **Powerful like an ERP. Simple like a modern SaaS. Premium enough for enterprise
> customers across GCC and Arab markets.**

Status legend used across docs: ✅ built · 🟡 partial / foundation · 🔜 planned.

VANTORA is a **multi-tenant, fully modular Business OS**: one shared platform +
reusable modules, adopted **module-by-module** or as the full platform, and able
to **coexist with an external ERP** (sync only selected modules). See
`PRODUCT_PRINCIPLES.md`.

## Product & principles
- [`PLATFORM-REVIEW.md`](PLATFORM-REVIEW.md) — **official post-build platform
  baseline** (executive summary → architecture → licensing → modules → packs →
  adapter portfolio → security → roadmap → tech-debt → GTM).
- [`COMPLETION-REPORT.md`](COMPLETION-REPORT.md) — **program completion report**
  (completed items · final capabilities · adapter portfolio · Electrical pack ·
  future roadmap · pilot + commercial launch plans).
- [`COMMERCIAL-LAUNCH.md`](COMMERCIAL-LAUNCH.md) — **commercial launch package**
  (pricing · packages · licensing · demos · pilots · landing page · pitch deck ·
  GTM · FMCG + Electrical pilot execution plans).
- [`PRODUCT_PRINCIPLES.md`](PRODUCT_PRINCIPLES.md) — the standing decision rule
  (Platform → Module → Customer) + modularity & coexistence principle.
- [`ROADMAP.md`](ROADMAP.md) — completed milestones + the formally-tracked
  forward roadmap (reviews + build sub-slices).
- [`MODULE-CATALOG.md`](MODULE-CATALOG.md) — every module, one page each.
- [`MODULE-OWNERSHIP-MATRIX.md`](MODULE-OWNERSHIP-MATRIX.md) — system-of-record &
  ERP-coexistence ownership, per module/entity.
- [`LICENSING.md`](LICENSING.md) — plans, module entitlement, marketplace,
  subscriptions (reference).
- [`R4-LICENSING-BUILD.md`](R4-LICENSING-BUILD.md) — R4 licensing build design (capability modules + entitlement).
- [`LICENSING-ARCHITECTURE.md`](LICENSING-ARCHITECTURE.md) — target-state licensing & subscription design (R4 review).
- [`UI-ALIGNMENT-BUILD.md`](UI-ALIGNMENT-BUILD.md) — nav binding + inline role suggestions design (R4B follow-up).
- [`UI-ALIGNMENT-REVIEW.md`](UI-ALIGNMENT-REVIEW.md) — company-creation / subscription UI alignment to the licensing model (relabel/regroup only).
- [`MARKETPLACE-STRATEGY.md`](MARKETPLACE-STRATEGY.md) — module / integrations /
  partner / AI marketplace strategy (R5 review).
- [`PILOT-READINESS.md`](PILOT-READINESS.md) — pilot customer readiness plan
  (R6 review).
- [`PACK-ELECTRICAL.md`](PACK-ELECTRICAL.md) — Electrical Retail & Wholesale pack
  design (multi-tier pricing / serials / warranty / RMA / supplier returns).
- [`PACK-ELECTRICAL-B.md`](PACK-ELECTRICAL-B.md) — Electrical pack sub-slice B
  design (serial numbers / warranty / RMA).
- [`CAPABILITY-SEED.md`](CAPABILITY-SEED.md) — universal CRM/Workflow/Analytics
  new-company seed + nav binding (closes the deferred UI-alignment gap).

## Architecture
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — full system architecture.
- [`PLATFORM-OVERVIEW.md`](PLATFORM-OVERVIEW.md) — one-page platform map.
- [`ENTITY-FRAMEWORK.md`](ENTITY-FRAMEWORK.md) — the entity registry & contract.
- [`CONVENTIONS.md`](CONVENTIONS.md) — code conventions.
- [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) — navy/cyan tokens + shared primitives.
- [`CUSTOM-FIELDS.md`](CUSTOM-FIELDS.md) — custom fields engine.

## Integration
- [`INTEGRATION.md`](INTEGRATION.md) — integration architecture (inbound API,
  webhooks, connectors, sync).
- [`INTEGRATION-ADAPTERS.md`](INTEGRATION-ADAPTERS.md) — external-ERP adapter
  roadmap (SAP / Oracle / Dynamics / Odoo).
- [`ADAPTER-DYNAMICS-BC.md`](ADAPTER-DYNAMICS-BC.md) — Dynamics 365 Business Central adapter (B2).
- [`ADAPTER-SAP.md`](ADAPTER-SAP.md) — SAP S/4HANA adapter design (B3).
- [`ADAPTER-SAP-ONPREM.md`](ADAPTER-SAP-ONPREM.md) — SAP On-Prem / ECC file + middleware transport design (B3b).
- [`ADAPTER-ODOO.md`](ADAPTER-ODOO.md) — Odoo JSON-RPC adapter design (B5).
- [`ADAPTER-NETSUITE.md`](ADAPTER-NETSUITE.md) — Oracle NetSuite SuiteTalk REST + TBA adapter design (B4).
- [`API-WEBHOOKS.md`](API-WEBHOOKS.md) — inbound `/api/v1` + outbound webhooks
  reference (integrator-facing).
- [`SYNC-ENGINE.md`](SYNC-ENGINE.md) — connections, sync jobs, dispatcher.
- [`ETA.md`](ETA.md) — Egyptian e-invoicing.

## Operations
- [`OWNER_GUIDE.md`](OWNER_GUIDE.md) — platform owner / internal staff.
- [`MAINTENANCE.md`](MAINTENANCE.md) · [`STAGING.md`](STAGING.md) ·
  [`BACKUPS.md`](BACKUPS.md) — deploy / migrations / staging / backups.
- [`TESTING.md`](TESTING.md) · [`E2E.md`](E2E.md) — testing.

## Governance
- [`LEGACY-AUDIT.md`](LEGACY-AUDIT.md) — Keep / Refactor / Archive / Delete audit.
- [`CLEANUP-PLAN.md`](CLEANUP-PLAN.md) — deferred-cleanup execution plan (separate reviewable PRs).

---

**Doc maintenance rule:** every feature PR records its Platform/Module/Customer
classification and updates the affected docs (Module Catalog / API reference /
roadmap). Capability docs use the status legend so nothing is over-claimed.
