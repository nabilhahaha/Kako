# Configurable Hierarchies — Architecture (Org + Product)

**Status: FUTURE ARCHITECTURE — design only, no implementation.** Captures the
requirement that company onboarding define **organization**, **user-reporting**, and
**product** hierarchies from the UI, per company, with **no hard-coded levels**, and
that **data scoping inherit** from the org/reporting tree.

## Where we are today (the thing to generalize)
- **Org levels are hard-coded tables:** `erp_regions → erp_areas → erp_branches →
  erp_teams`, with `erp_user_branches(role, branch_id, reports_to, team_id)` and
  `erp_routes`. Scope functions (`erp_customer_in_scope`, `erp_route_in_scope`)
  **branch on fixed role names** (regional_manager / area_manager / branch_manager /
  supervisor / salesman).
- **Product levels are hard-coded tables:** `erp_product_categories`,
  `erp_fashion_brands`, `erp_product_uoms`, `erp_products_catalog` (+ batches/serials).
- No generic hierarchy-definition engine exists. → Adding a tier or renaming a level
  today means code + schema changes.

**Principle:** replace fixed levels + role-name branching with a **data-driven tree**:
`(level definitions) + (nodes) + (assignments)`, per company. Code references levels by
**id / capability tags**, never by hard-coded name.

---

## 1) Organization & Reporting Hierarchy (configurable)

### Data model (proposed)
- **`erp_org_levels`** — per-company level definitions:
  `id, company_id, name (renamable: "Region"/"Area"/"Branch"/"Team"…), depth, sort_order,
  parent_level_id, can_hold_users bool, can_hold_manager bool`.
  *Drag/drop ordering = `sort_order`; rename = `name`; add/remove = rows.*
- **`erp_org_nodes`** — the actual tree:
  `id, company_id, level_id, parent_node_id, name, manager_user_id, sort_order`.
  (A node = a specific Region "North", Branch "Cairo-1", Team "Hany's team", …)
- **`erp_user_org_assignments`** — users on nodes:
  `id, company_id, user_id, node_id, role_tag, is_primary`.
- **Reporting tree:** `reports_to` is **derived from the node tree** — a user reports to
  the `manager_user_id` of their node (or nearest ancestor node with a manager). Keep
  `erp_user_branches.reports_to` as the materialized edge for fast queries (refreshed
  when the tree changes). `team_id` becomes "the user's node id".

### Visibility / scoping inherits from the tree (one rule for all tiers)
- Recursive helper **`erp_org_subtree(p_node_id)`** → all descendant node ids
  (cycle-guarded recursive CTE over `parent_node_id`).
- Recursive helper **`erp_reports_subtree(p_user_id)`** → all descendant user ids
  (direct + indirect) over `reports_to` (per the prior P4 note).
- **Scope predicate (replaces the per-role branches):** a row is visible when its owning
  rep / branch / node is within the viewer's subtree:
  `owner_rep ∈ erp_reports_subtree(auth.uid())  OR  row_node ∈ erp_org_subtree(my_node)  OR  own  OR  company-wide`.
- Result: **Sales Rep → own · Supervisor → direct+indirect reports · Area → all teams in
  area · Regional → all areas in region · Sales Director → company sales org** — all from
  **one subtree walk**, no role-name hard-coding. Adding a tier = adding `erp_org_levels`
  rows + `reports_to` edges; **no code change**.

### Onboarding UX
Admin builds the org: define levels (add/rename/reorder), build nodes (drag/drop),
assign users + managers to nodes. Some companies use `Company → Branch → Rep`; others
`Company → Region → Area → Branch → Team → Rep` — both are just different `erp_org_levels`
rows. Industry templates seed a starting set.

---

## 2) Product Hierarchy (configurable) + Units

### Data model (proposed)
- **`erp_product_levels`** — per-company: `id, company_id, name (renamable:
  "Category"/"Brand"/"Family"/"SKU"/"Pack"…), depth, sort_order, parent_level_id`.
- **`erp_product_nodes`** — the product tree: `id, company_id, level_id, parent_node_id,
  name, sort_order`.
- **SKU assignment:** `erp_products_catalog.node_id` (a product sits at a leaf node);
  reports/MSL/pricing roll up the tree via `erp_product_subtree(node_id)`.
- **Multi-UoM (orthogonal to the tree):** keep/extend `erp_product_uoms`
  (`product_id, uom, factor_to_base, is_base, barcode`) → Unit / Pack / Carton with
  conversion factors; selling/loading/pricing reference a UoM, not a hierarchy level.

### Industry-specific structures (configurable, not coded)
Seed **templates** per industry, fully editable after:
- FMCG: Category → Brand → Family → SKU (+ Unit/Pack/Carton)
- Pharmacy: Category → Generic → Brand → SKU
- Fashion: Category → Brand → Style → Variant (size/color)
- Distribution/Wholesale: Supplier → Category → SKU
The code never assumes "Brand" or "SKU" exists — it walks `erp_product_levels`.

---

## Cross-cutting design rules
- **No hard-coded level names** anywhere in code/RLS — reference levels by `id` and
  capability flags (e.g., `can_hold_manager`), and roles by **tree position**, not by the
  names Supervisor/Area/Regional/Director/Category/Brand/SKU.
- **One generic engine, two instances** (org + product) — same `(levels, nodes,
  assignments)` shape; could share a `erp_hierarchies(kind)` base if desired.
- **Scoping** = recursive subtree predicates (`erp_*_subtree`) — generalizes and
  eventually **replaces** `erp_customer_in_scope`'s role-name branches.
- **Drag/drop + rename + add/edit** map to `sort_order` / `name` / row CRUD.

## Backward-compatible migration (when built)
1. Seed each existing company's `erp_org_levels` from current Region/Area/Branch/Team and
   `erp_product_levels` from Category/Brand — populate nodes from existing rows → behavior
   preserved.
2. Materialize `reports_to` edges from the node managers.
3. Switch scope functions to subtree predicates behind a per-company flag; validate against
   the current per-role results (e.g., the P1–P4 scoping evidence) before flipping defaults.
4. Keep `erp_branches`/`erp_routes` as the "branch"/"route" nodes for compatibility.

## Relationship to current work
This is the **end-state** the P4 plan already pointed at (recursive `reports_to` tree). P4
(supervisor = team) should be implemented with the `erp_reports_subtree` helper so it slots
into this model without rework. **No part of this is implemented; recorded for onboarding/
platform roadmap.**
