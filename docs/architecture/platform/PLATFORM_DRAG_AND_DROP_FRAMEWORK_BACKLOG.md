# Platform-Wide Drag-and-Drop Framework (Backlog — revisit AFTER Phase 7)

**Status:** 🗓️ **Roadmap only — do NOT implement now.** Current priority is Phase 7
(7A → 7B → 7C → 7D → 7E) and must not be interrupted. Revisit after Phase 7 completion.

## Goal
A single reusable drag-and-drop **platform capability** (one engine + primitives), so every
DnD surface shares the same behavior, a11y, RTL, persistence, and permission model — not N
bespoke implementations.

## Target consumers (later)
Route Planning · Route Sequencing · Territory Assignment · Dashboard Builder · Mapping Studio ·
Dynamic Field Governance · Form Builder · Workflow Builder · Approval Chains · Organization
Hierarchy · Role Templates · Entity-360 Layouts · Navigation/Menu Builder.

## Requirements (to design against)
Desktop · mobile · tablet · **touch** · **RTL** compatibility · **accessibility** (keyboard
nav + ARIA) · **auditability** (every reorder/move audited) · **permission-aware** actions
(gate drag/drop by role/permission) · **persistence reliability** (optimistic + server-confirmed,
conflict-safe).

## Notes for the future proposal
- Build as a thin platform wrapper (e.g. over a mature, RTL/touch/keyboard-capable DnD lib) exposing
  a pure reorder/move model + a persistence + permission + audit contract — consumers supply data +
  handlers only. Mirrors the reuse-first, engine-first discipline used across the platform.
- The Production Readiness Review (M9) already flagged the existing workflow-builder canvas (React Flow)
  as needing keyboard/RTL/mobile hardening — this framework would standardize that.

*Captured per request; no code, schema, or implementation until Phase 7 is complete and this item is
greenlit as its own design review.*
