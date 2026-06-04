# Platform Grouping Audit (review-only)

*Code-grounded sweep of layout/grouping primitives per module. No implementation, no merge, no production deployment. All findings are UX-polish/consistency — none are pilot blockers.*

**Platform grouping standard (established):** forms → shared **`FormSection`** (UX-2); lists → **responsive table (desktop) ↔ cards (mobile)** + pagination/search (S1); settings → **nav subsection grouping**; config screens → **Cards/Sections (+ collapsible)**.

## Per-module status
| Module | Grouping? | Type | Consistent w/ standard? | Mobile behavior | Flat layout remaining? |
|---|:--:|---|:--:|---|---|
| **Customers** | ✅ Yes | **Sections** (`FormSection` ×6) + responsive list | ✅ **Yes (reference impl)** | cards (`sm:hidden`) ↔ table | No |
| **Products** | ◐ Partial | Card container + **flat grid** form; table list | ❌ No | horizontal-scroll table (no cards) | **Yes** (form grid) |
| **Suppliers** | ◐ Partial | Card + **flat grid** form; table list | ❌ No | horizontal-scroll table | **Yes** (form grid) |
| **Inventory** | ✅ Yes | **Tabs** (levels/movements) + table | ◐ Partial | scroll table (no cards) | table within tab |
| **Sales / Orders** | ◐ Partial | **flat grid** form + line-items table | ◐ Partial | scroll table | **Yes** (order form) |
| **Invoices** | ✅ Yes | list responsive + dialogs; create form grid | ◐ Partial | cards ↔ table (list) ✅ | partial (create form grid) |
| **Collections** | ✅ Yes | **Modal/dialog** (payment) + rep terminal | ✅ Yes | modal | No |
| **Returns** | ◐ Partial | Card + **flat grid** form; table list | ❌ No | scroll table | **Yes** (form grid) |
| **Visits (journey)** | ◐ Partial | Cards + scheduling grid | ◐ Partial | grid stacks | minor |
| **Approvals** | ✅ Yes | **Cards** (task list) | ✅ Yes | stacked cards (card-native) | No |
| **Dashboards** | ✅ Yes | **Cards** + category sections (stat grid, recent, low-stock) | ✅ Yes | responsive grid (2→4) | No |
| **Settings** | ✅ Yes | **Category/Hierarchical** nav (5 labeled subsections, 18 grouped items) | ✅ Yes | drawer | No |
| **DFG** | ✅ Yes | **Cards + Sections** (Reuse / Draft-Publish / Sections / Fields) + collapsible | ✅ Yes | stacked cards | No |
| **Workflow Designer** | ✅ Yes | **Tabs** + Cards + grid | ◐ Partial | grid stacks | minor |
| **Onboarding Wizard** | ✅ Yes | **Hierarchical / Steps** (setup wizard); onboarding = simple form | ◐ Partial (assisted; full wizard roadmap) | stacks | minor |

## UX inconsistencies in grouping patterns
1. **`FormSection` (the form-grouping standard) is adopted only in Customers.** Products, Suppliers, Orders, Returns (and the Invoice create form) still use ad-hoc `grid-cols-*` flat grids → **inconsistent form grouping**. UX-2 was never rolled out beyond Customers.
2. **Responsive table↔cards is only in Customers + Invoices.** Products, Suppliers, Inventory, Returns render **horizontal-scroll tables on mobile** (no card view) → **inconsistent mobile list behavior**.
3. **Mixed (but individually reasonable) idioms:** Inventory uses Tabs, DFG uses Cards+Sections, Approvals/Dashboard use Cards — acceptable per screen, but the *form* and *list-mobile* standards aren't applied uniformly.
4. **DFG section presentation** (icons / help / collapsible / default-collapsed) exists in the section-metadata design but the consuming forms (e.g., Customers) don't yet render dynamic section chrome — a known DFG-3 follow-up.

## Classification (all non-blocking)
- 🟠 **Before First Paying Customer (consistency polish):** roll `FormSection` into Products / Suppliers / Orders / Returns / Invoice-create; add responsive cards to Products / Suppliers / Inventory / Returns lists.
- 🟢 **Can Wait:** dynamic section chrome rendering (DFG-3 follow-up), Workflow/Onboarding visual polish.
- **Pilot impact:** none — every screen is usable; grouping gaps are cosmetic/consistency, not functional or data-safety issues.

*Audit only. No new features, no UI changes applied, no merge, no production deployment.*
