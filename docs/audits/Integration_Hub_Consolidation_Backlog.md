# Integration Hub Consolidation — Future Architecture Review (backlog)

**Status:** Future architecture review only — **not started; audit-first when scheduled. Do not implement now.** Recorded 2026-06-18. **Supersedes** the earlier "Data Hub Consolidation" note (now a subset — see §1).

## Observation
Integration-related capabilities are distributed across many areas: Data Entry · Import · Export · Data Exchange · Connections · APIs · Webhooks · Sync · AI Services · E-Invoicing · External Systems.

## Long-term goal
Create a **single Integration Hub** experience that is the canonical entry point for **all external connectivity**.

## Future review scope (7 areas)
1. **Data Exchange** — Import · Export · Templates · Bulk Update · History · Errors
2. **Connected Systems** — Google Sheets · ERP Connectors · SAP · Odoo · future integrations
3. **APIs & Automation** — API Keys · Webhooks · Events · Sync Jobs
4. **E-Invoicing** — ZATCA (KSA) · Egypt ETA · future tax platforms
5. **AI Services** — OpenAI · Claude · OCR · Document AI
6. **Communication Services** — WhatsApp · Email · SMS · Notifications
7. **Monitoring** — Connection Health · Sync History · Error Logs · Retry Queue · Audit Trail

## Methodology (when scheduled)
- **Audit only first** — inventory every surface (component / actions / data / tables / gates), overlaps, and the current health/history/error/retry model. **No implementation.**
- Then architecture review → before/after → reuse analysis → implementation plan before execution (same gated methodology as Settings M3 / Admin Center Alignment / P5).
- Constraints expected: reuse-first; no business-logic / permission / RLS / workflow change unless separately approved.

## Sequencing & current priorities
Per direction, the **Integration Hub review happens after the Customer Workbench.** Current priority order:
1. ✅ **Permission Override Demonstration** (delivered)
2. **P5 Customer Workbench** (design delivered; awaiting approval to build)
3. **Distribution ERP completion**
4. **Integration Hub Consolidation review** (this item — after P5/Customer Workbench)

## Notes
- Prior work already partially consolidated this space: M3-C unified Import+Export into **Data Exchange**; the Integrations workbench already tabs Connections/API Keys/Webhooks/Sync; Integration Hub remains a dashboard. This initiative would unify all 7 areas under one coherent hub with shared health + sync-history + error/retry + audit.
- The earlier **Data Hub Consolidation** backlog note is **subsumed** by this broader Integration Hub review.

## Disposition
**Parked** until after the Customer Workbench. Begins with an audit-only pass; nothing is implemented until that audit + plan are reviewed and approved.
