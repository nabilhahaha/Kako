# Data Hub Consolidation — Future Review Item (backlog)

**Status:** Roadmap / backlog only — **not started, audit-first when scheduled.** Recorded 2026-06-18. Sequenced to begin **after P5 Customer Workbench**.

## Goal
Create **one clear "Data Hub" experience** for import, export, integrations, sync history, and error handling — consolidating today's scattered data/integration surfaces.

## In-scope surfaces to review (audit first)
- **Data Entry Center** (manual entry surfaces)
- **Data Exchange** (`/settings/import` — Import · Export tabs, from M3-C)
- **Import / Export** engines (`ImportWizard`, `ExportPanel`)
- **Integration Hub** (`/settings/integration-hub` — dashboard)
- **Connections** (`/settings/integrations` → Connections tab)
- **Webhooks** (integrations workbench tab)
- **Sync** (integrations workbench tab + sync history)
- **Error handling** (import job errors, sync failures, retry/inspect)

## Methodology (when scheduled)
1. **Audit only first** — inventory every surface, its component/actions/data, overlaps, and the current error/history model. **No implementation.**
2. Architecture review → before/after → reuse analysis → implementation plan before execution (same gated methodology as Settings M3 / Admin Center Alignment).
3. Constraints expected: reuse-first; no business-logic / permission / RLS / workflow change unless separately approved.

## Notes / prior context
- M3-C already consolidated Import + Export into a single **Data Exchange** page; M3-E left Integration Hub as a dashboard and the Integrations workbench already tabs Connections/API Keys/Webhooks/Sync. This initiative would unify those into one coherent **Data Hub** with a shared sync-history + error-handling view.

## Disposition
**Parked** until after P5. Begins with an audit-only pass; nothing is implemented until that audit + plan are reviewed and approved.
