# Navigation Redundancy Audit

### Finding repeated concepts, label echoes, and depth-reduction opportunities

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18 · **Status:** Findings & recommendations — *no implementation.*

Triggered by the observed "Approvals → Approval Routes → Routes" stutter. Audit grounded in the real navigation data: `src/lib/erp/navigation.ts`, `src/lib/erp/settings-sections.ts`, and the settings page files.

---

## Root cause — two parallel Settings navigations

When a user is in Settings, two different catalogs list the **same pages** under **different group names**:

| | Catalog | Where | Groups | ~Items |
|---|---|---|---|---|
| **A** | `nav.sections.settings` | global **sidebar** (`navigation.ts:470`) | Organization · Data & Fields · Finance · Integrations · Governance · Personal (6) | ~40 |
| **B** | `SETTINGS_SECTIONS` | in-page **top grouping** (the re-chunk) | Organization · People & Roles · Products & Modules · Workflows · Integrations & Data (5) | ~21 |

The Settings re-chunk improved catalog **B** but did **not** retire catalog **A**, so the same page (Branches, Approvals, …) now appears in the sidebar *and* the top tabs, under two different group labels. This is the duplication being felt; the "Approvals" stutter is its sharpest instance.

---

## Finding 1 — the same concept repeated across levels

Tracing **"Approvals"** end to end (real labels):

```
Sidebar:  Settings > Governance > "Approval Matrix"      (navigation.ts:515)
Top nav:  "Workflows" group > "Approvals" page           (settings-sections.ts)
Page:     PageHeader "Approvals"                          (approval-matrix/page.tsx:46)
In-page:  RelatedNav "back to Settings" + links to        (approval-matrix/page.tsx:42-44)
          Workflows / Workflow Templates
```

One destination, **5 wayfinding layers, ~3 different names** ("Approval Matrix" / "Workflows" / "Approvals"). The same pattern repeats:

| Concept | Shows up as |
|---|---|
| **Approvals** | sidebar "Approval Matrix" · global "/approvals/queue" (Approvals) · top-nav page "Approvals" · page H1 "Approvals" · related-nav |
| **Workflows** | top-nav GROUP "Workflows" · page "Workflows" · sidebar "Workflows" · "Workflow Templates" |
| **Integrations** | module concept · sidebar group "Integrations" · top-nav group "Integrations & Data" · page "/settings/integrations" ("Integrations") · "Integration Hub" |
| **Organization** | top-nav group "Organization" · page "/settings/organization" (Reporting Lines, labelled "Organization") · "Org Structure" |

---

## Finding 2 — page and parent group carry the same meaning

These groups are tautological — the group name adds nothing over its page:

- **Workflows** group → **Workflows** page
- **Integrations & Data** group → **Integrations** page (+ "Integration Hub")
- **Organization** group → **Organization** page (+ "Org Structure")

---

## Finding 3 — extra ad-hoc layers

Several pages carry a **`RelatedNav`** ("back to Settings" + sibling links, e.g. `approval-matrix/page.tsx:41`). Now that the top grouping surfaces siblings, this is a redundant fourth wayfinding strip.

---

## Finding 4 — two taxonomies for one domain

The sidebar groups settings as *Governance / Data & Fields / Finance / …*; the top nav groups them as *People & Roles / Products & Modules / Workflows / …*. Same pages, two mental models — the user must learn both.

---

## Depth: today vs target (the Approvals path)

```
TODAY  (≈5 layers, 3 names for one destination)
Platform bar
 └ Sidebar: Settings ▸ Governance ▸ "Approval Matrix"
     └ Top nav: "Workflows" ▸ "Approvals"
         └ PageHeader "Approvals"
             └ RelatedNav: back / Workflows / Templates

TARGET (3 layers, each distinct)
Platform bar
 └ Sidebar: "Settings"
     └ Top nav: "Workflows" ▸ tab "Approvals"
         └ content
```

---

## Recommendations (priority order)

### R1 — One Settings navigator *(safe, immediate)*
Collapse the sidebar's ~40-item Settings catalog into a **single "Settings" link**; let the in-page **top grouping be the only settings navigator**, on **one** taxonomy (the 5 groups). Removes an entire rail level and eliminates the catalog A/B duplication. **Pure navigation change — no page touched, permissions unchanged.**

### R2 — Merge facet-pages into one page with tabs *(kills the stutter)*
Where sibling pages are facets of one concept, make them tabs so the group has **one** entry:
- **Approval Matrix + Workflows + Workflow Templates → one "Workflows" page** with tabs *Approvals · Builder · Templates* — directly removes "Approvals → Approval Routes → Routes".
- **Integration Hub + Integrations + Import/Export → one "Integrations" page** with tabs.
- **Organization (Reporting) + Org Structure → one "Organization" page.**

*Bigger — touches routing/components; must preserve every existing action, permission, and RLS check. Needs its own approval.*

### R3 — A group may never share a name with one of its pages
Where a merge isn't wanted, rename the **group** to the category (e.g. group "Automation" → page "Workflows"). Prefer R2 over R3 when pages are true facets.

### R4 — Drop the per-page `RelatedNav` / back-link
Once the top grouping provides siblings, the related strip is redundant.

### R5 — Make it a Constitution rule (so it cannot recur)
> "No label may repeat across adjacent navigation levels. A group is named for its category, never for one of its pages. Sibling pages that are facets of one concept are tabs, not separate nav entries."

---

## Honest note & ownership

The second layer is partly self-inflicted: the re-chunk added catalog **B** without retiring catalog **A**. **R1 is the corrective** and is a safe, pure-navigation change. R2 is where the real depth (and the stutter) disappears, but it consolidates pages, so it is held as a recommendation pending approval.

**Proposed next step options:**
- **(a)** Proceed with **R1 only** — safe, immediate, removes the duplication.
- **(b)** Scope **R2** page-merges into a sequenced, approval-gated plan.
- **(c)** Adopt **R5** into the Navigation Standard now and sequence R1–R4 after.

No implementation until you choose.
