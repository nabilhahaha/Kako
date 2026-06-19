# Customer Workbench Governance — Completion Review

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-19 · **Status:** Governance workstream (G1–G7 + G6b + visibility) **complete, validated, pushed.**

The Customer Workbench governance & visibility enhancements are delivered, reuse-first, one validated commit per phase. No permission-model, RLS, or workflow change; one additive, backward-compatible schema migration (the `request` access level).

---

## What shipped

| Phase | Outcome | Commit |
|-------|---------|--------|
| **G1** | Read-only Commercial + Territory context on Overview (credit limit · terms · salesman · **supervisor** · route · region · area · visit day) | `df01283` / `67f1cda` |
| **G2** | Last Activity summary (last visit · order · invoice · collection · return; order from `erp_sales_orders`) | `7317ca4` |
| **G3** | Customer Health band + score (Healthy ≥80 / At-Risk 60–79 / Inactive 30–59 / Critical <30), **separate** from master status | `f6f2a00` |
| **G4** | Transfer history (prev→new salesman/route/region + reason · date · status) | `e1c9b99` |
| **G5** | Structured audit envelope (`field/changes old→new · role · reason · requestRef`) across direct edits + requests | `2135ee2` |
| **G6** | "Request Change" as a first-class, UI-configurable field-access level (additive migration `0348`) | `0639824` |
| **G7** | End-to-end Request Change lifecycle: **View → Request Change → Approve → Apply → Audit** | `fbc64df` |
| **G6b** | Opt-in "Use Recommended Baseline" template (never auto-applied; overrides win) | `e5f0866` |
| **Visibility** | Pending change requests shown read-only in Customer 360 (fields · status · requester · date) | `e5f0866` |

---

## Governance model — final state

- **5 levels:** Hidden · View · **Request Change** · Edit · Approve (Approve = workflow capability).
- **Configurable per company × role × field** via the existing Field Governance UI (`erp_field_access`); the **recommended baseline** is an opt-in one-click template, and **company overrides are the final authority**.
- **Admin-lockout** preserved (admins never below Edit on protected fields).
- **Audit:** every direct Edit, Request submission, and Approve/Reject + Apply emits the structured envelope.

## Lifecycle (operational)

```
View (read-only)  →  Request Change (Profile panel → erp_customer_change_requests)
   →  Approve (Approvals queue + workflow)  →  Apply (handler writes the change)
   →  Audit (structured envelope at submit + decision/apply)
```
Pending requests are visible read-only in the workbench (transparency, **not** a second approval screen).

## Validation

| Check | Result |
|-------|--------|
| `tsc --noEmit` | clean (every phase) |
| `vitest run` | **1616 passed** / 192 skipped (+ new helper tests across G3/G5/G6) |
| `next build` | success (every phase) |
| Schema | one additive, backward-compatible migration (`0348` — `request` enum); no backfill |
| Constraints | no permission-model / RLS / workflow change |

## Deferred / recorded (document-only)

- **G8** — country-aware Structured Address (design-only).
- **Role Builder & Permission Studio** — future platform capability on the governance model.
- **Request-level attachments** (proof docs in object storage, references in DB — no perf impact).
- **Pricing governance** — separate workstream (per-customer price lists not modelled).
- **Coverage & Journey-Plan engine** — visit frequency, coverage status, JP adherence, route optimization/balancing.
- **Customer Planning & Targeting** — separate planning workstream.

## Recommended next workstream
With governance + visibility complete, the natural next major workstream is the **Coverage & Journey-Plan engine** (it owns visit frequency / coverage status that the workbench already reads), or the **Pricing-governance** workstream (prerequisite for surfacing per-customer pricing). Both are scoped and parked; either can start with the standard audit-first methodology on approval.
