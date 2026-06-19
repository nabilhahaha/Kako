# Territory Intelligence Studio — Product Readiness Completion

**Track:** TIS Product Readiness (demo-ready → product-ready), autonomous.
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19
**Boundaries honoured:** no RO-4, no VTP-4, no Apply-to-live, no live route/customer
reassignment. **All work is read-only + export. No live data was modified.**

---

## Blocks delivered

### 1. Studio UX hardening (P0 + P1)
- **Shared scope** (Region → Salesman → Route) lifted to Studio state; **persists
  across navigation**; Overview · Audit · Map · Optimize · Plan and the **persistent
  map** all respect the same scope; **map and board always show the same scoped set**.
- **Import preview + confirmation** (parsed/mapped counts + detected columns + first
  rows) — nothing is replaced until confirmed; **Reset to live data** undo.
- **Map legends** on every layer; **customer click popup** (name · code · route ·
  salesman · grade · coverage).
- **Export** is a visible workflow step (sub-nav stage) + toolbar action.
- **KPI drill-downs** from Overview; **deep-links open in a new tab** (Studio session
  preserved).

### 2. Map color modes
- **Color by: Route · Salesman · Coverage · Territory · Customer Grade**; only modes
  the scoped data supports are offered; the **legend updates dynamically** with names.

### 3. Optimization constraints (Simplicity Model)
- **Simple:** Number of Routes · Working Days · **Balance By** (Workload / Sales Value
  / Customer Count) · Generate. Inline **feasibility recommendation** ("Use N routes").
- **Advanced (collapsed):** Max Customers/Route · Max Visits/Day · **Visit Duration**
  (+ estimated weekly field-time).
- **Expert (hidden):** Traffic · Time Windows · Vehicle Capacity · Advanced weights
  (placeholders, behind a hidden toggle).

### 4. New Optimization (Excel-in/out session)
- `/distribution/new-optimization`, gated by **`tis.run_optimization`** —
  **permission-based, not role-based** (any user granted it sees it). Temporary
  session, **no live reads/writes**; opens on Import in Simple Mode; full toolset
  (preview · constraints · optimize · map + route/day/salesman · drag · export).

### 5. Weekly single-salesman Journey Builder
- `/distribution/journey-builder`: Select Salesman → Week → Working Days → Max
  Visits/Day → Generate → **Review by Day** → Adjust (drag) → Export. Inline weekly
  **capacity check**. Built on the shared planning engines.

### 6. Expected Visit Duration (first stage)
- Shared resolver with precedence **Customer → Channel → Class → Global default
  (20 min)** + `visitMinutesPerWeek`. Global default exposed in Advanced with an
  estimated field-time readout. (Travel-time + time-based balancing = future stage.)

### 7. Shared planning architecture
- **`@/lib/planning`** is the single source of truth (frequency/workload · working
  days · day assignment · balancing + constraints + feasibility · scope · scenario +
  edits · visit duration), consumed by New Optimization, Studio, Journey Builder, and
  future Journey Planning / Route Management. **No duplicated planning logic.**

### 8. Simplicity Model
- Governing UX principle adopted: **Simple default · Advanced optional · Expert
  hidden**. Every new setting passes "does a supervisor need this?" — if not, it sits
  in Advanced/Expert, collapsed.

---

## Validation

| Gate | Result |
| :--- | :--- |
| `tsc --noEmit` | Clean across all blocks |
| Unit tests (vitest) | Green — added scope, feasibility/day-distribution, visit-duration, planning-surface, header-mapper tests |
| i18n symmetry (ar/en) | Passing |
| `next build` | Green — `/distribution/studio`, `/new-optimization`, `/journey-builder` all build |
| Vercel `kako` | Deployed Ready on each push |

**Preview URLs**
- Studio: `/distribution/studio?demo=1`
- New Optimization: `/distribution/new-optimization` (needs `tis.run_optimization`)
- Journey Builder: `/distribution/journey-builder?demo=1`

---

## Remaining gaps (safe to defer)

- **True .xlsx export** — exports are CSV today (open directly in Excel); a native
  `.xlsx` writer is a follow-up.
- **Monthly journey** — weekly is shipped; monthly needs cadence/week-of-month
  expansion (a new shared engine).
- **Time-based balancing** — the visit-duration resolver exists; wiring travel-time +
  minutes/day capacity into the optimizer is the next duration stage.
- **Channel/Class duration overrides UI** — the resolver supports them; only the
  global default is exposed so far.

None require a live-write or architecture fork.

---

## Confirmation

No live tenant data was read for writing or modified anywhere in this track. Imports
create temporary in-session datasets; New Optimization never touches live tables;
every output is an export. RO-4 / VTP-4 / Apply remain paused.
