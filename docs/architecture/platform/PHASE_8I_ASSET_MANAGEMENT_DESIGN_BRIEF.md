# Phase 8I — Asset Management (industry pack): Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive ·
multi-tenant RLS · governance + audit · flag default OFF (`KAKO_ASSET_MGMT`). **Optional pack.**

## 1. Intent
Track field/trade assets a distributor deploys at outlets — coolers/fridges, freezers, display
racks, POS materials — with deployment, location, condition, audit photos, and recovery. Core to
FMCG trade execution (cooler compliance is a real KPI).

## 2. Reuse vs net-new
- **Reuse:** `erp_attachments` (asset/audit photos, incl. the Step 1 **offline media** pipeline),
  GPS capture (0131), the retail-execution/merchandising surface (0144), customers/outlets,
  surveys (asset-condition checks), and the field client.
- **Net-new:** an asset registry + deployment (asset↔outlet) + condition/audit history.

## 3. Data model (additive)
- `erp_assets` (`company_id, code, type, serial?, principal_id?, status, value?`),
  `erp_asset_deployments` (`asset_id, company_id, customer_id, deployed_at, recovered_at?,
  lat/lng, condition`), `erp_asset_audits` (`asset_id, company_id, visit_id?, condition,
  photo_attachment_id?, audited_at`). Company-scoped RLS; FK-covering indexes.

## 4. Forms / Field-Governance / Mobile / Offline
- Asset audits reuse **forms/surveys** (8F) + **offline media** (Step 1) — a field rep audits a
  cooler offline (photo + condition), syncing via the established pipeline (likely linked to the
  visit, like media). Governance-aware fields. First-class mobile.

## 5. Audit / Security / Multi-tenant
Deployment/recovery/audit events audited. Company-scoped RLS; an asset and its photos never cross
tenants. Asset photos use the private attachments bucket + signed URLs.

## 6. Integration
Asset value/depreciation can post to accounting later (out of initial scope — honors the
DO-NOT-START financial-suite boundary). `principal_id` link makes cooler-compliance a **PIL**
metric (principal-scoped). Feeds dashboards/reports (8B/8C).

## 7. Phasing / Risks / Non-goals
- **8I-1** asset registry + deployment. **8I-2** condition audits (forms + offline media).
  **8I-3** recovery + cooler-compliance reporting (+ PIL link).
- **Risk:** scope into fixed-asset accounting → explicitly out (operational tracking only now).
  **Risk:** photo volume → reuse compression + retention.
- **Non-goals:** not depreciation/GL (deferred); not fleet (8H); not IoT telemetry.

**Recommendation:** proceed as an **optional pack** behind `KAKO_ASSET_MGMT` (OFF), reusing
attachments/offline-media/forms/GPS. Await approval.
