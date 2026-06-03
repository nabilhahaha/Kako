# VANTORA Authorization Model

**Status:** Specification v1.3 — _design only_. No implementation, no schema, not merged, not deployed.
**Scope:** Tenant (company) authorization. The platform-owner/provider permission tier is separate and out of scope (see §13).
**Authority:** This document is the authoritative reference for all future authorization work — both the backend model **and** the permissions UI (§17). Code, migrations, and UI must conform to it; deviations require an amendment here first.

---

## 1. Goals & principles

A single model — **Capability × Scope × Constraint × Field** — granular enough for FMCG today and extensible to any future industry **without redesign**.

1. **Orthogonal axes.** *What action* (capability), *which rows* (scope), *within what limits* (constraint), and *which columns* (field/DFG) are independent and composable.
2. **Roles are primary.** Authority comes from role assignments. Per-user overrides exist only for **exceptions**, to avoid role explosion.
3. **Additive & non-breaking.** Every existing role keeps exactly its current authority via a legacy→granular alias layer. A cutover test asserts *no role gains or loses access*.
4. **Closed vocabularies.** Fixed action verbs and scope dimensions prevent catalog sprawl.
5. **DB owns row visibility.** Scope is enforced in RLS; the TypeScript layer mirrors, never re-implements, the predicate.
6. **Admin safety.** `admin` / `it_admin` can never be locked out (already enforced in DFG; preserved here).
7. **Deny always wins.** An applicable deny at any layer is final.

---

## 2. The model, formally

```
Grant            := (capability, constraints?)
RoleDefinition   := role_key → Grant[]
Assignment       := (user, role_key, scopeRef)          // scope is per-assignment
UserOverride     := (user, capability, effect: grant|deny, reason)

effectiveCaps(u) = ⋃ roles(u).capabilities                     // primary
can(u, action)   = isSuperAdmin(u) ∨ action ∈ expandAliases(effectiveCaps(u)) ∨ granted(u, action)
rows(u, entity)  = RLS( scopeOf(assignment) )                  // axis 2
withinLimit(req) = ∀ c ∈ constraintsOf(u, action): c.ok(req)   // axis 3
fields(u,entity) = DFG.resolveAccess(entity, u)                // axis 4 (already built)
```

Final decision is the ordered pipeline in **§8**.

---

## 3. Axis 1 — Capability catalog (`module.resource.action`)

### 3.1 Naming convention
Every capability key has **three segments**: `module.resource.action`.
Rendered in the UI as **Module → Permission group (resource) → Action**.

### 3.2 Action vocabulary (closed set)
Core: `view · create · edit · delete · approve · export`.
Resource-specific (only where a genuinely distinct capability exists):
`cancel · discount · collect · transfer · adjust · post · request · count · override · writeoff`.
No new verb may be introduced without amending this section.

### 3.3 Sales
```
sales.order.view        sales.invoice.view         sales.return.view
sales.order.create      sales.invoice.create       sales.return.create
sales.order.edit        sales.invoice.edit_draft   sales.return.approve
sales.order.cancel      sales.invoice.cancel
sales.order.discount    sales.invoice.discount     sales.payment.collect
                        sales.price.override       sales.payment.writeoff
sales.export            returns.export             collections.export
```

### 3.4 Customers
```
customers.view                    customers.financials.view
customers.create                  customers.status.change
customers.edit.basic              customers.change_request.create
customers.edit.location           customers.change_request.approve
customers.delete                  customers.approval.approve
customers.export
```

### 3.5 Inventory
```
inventory.stock.view      inventory.stock.transfer        inventory.expiry.view
inventory.stock.adjust    inventory.adjustment.approve    inventory.count
inventory.export
```

### 3.6 Templated pattern for every other module
Each module declares its own `resource.action` tree from the same vocabulary. Representative:
```
purchasing.po.{view,create,approve}   purchasing.receipt.create   purchasing.return.{create,approve}   purchasing.export
suppliers.{view,create,edit}          suppliers.payment.collect   suppliers.export
accounting.journal.{view,post}        accounting.voucher.approve  accounting.export
pricing.rule.{view,edit}              pricing.list.publish        pricing.export
reports.{view}                        reports.export
settings.{branches,users,custom_fields}  workflow.manage          integrations.manage
```
**Vertical modules** (clinic, restaurant, salon, pharmacy, laundry, hotel, market, wholesale, electrical) keep their current module-level grant initially and adopt `resource.action` trees as each vertical needs depth. New industries register their own module tree — the model scales by registration, not redesign (see §12).

### 3.7 Legacy → granular alias map (backward compatibility)
Aliases expand to **≥ the historical authority** so no role regresses. `expandAliases()` resolves a legacy key to its granular set at check time, so existing `erp_company_role_permissions` rows keep working untouched.

| Legacy key | Expands to |
|---|---|
| `sales.sell` | `sales.order.{view,create,edit}`, `sales.invoice.{view,create,edit_draft}` |
| `sales.discount` | `sales.invoice.discount`, `sales.order.discount` |
| `sales.collect` | `sales.payment.collect` |
| `sales.return` | `sales.return.{view,create,approve}` |
| `customers.manage` | `customers.{view,create,edit.basic,edit.location,financials.view,change_request.create}` |
| `customers.approve` | `customers.approval.approve`, `customers.change_request.approve` |
| `customers.change_status` | `customers.status.change` |
| `inventory.view` | `inventory.stock.view`, `inventory.expiry.view` |
| `inventory.adjust` | `inventory.stock.adjust` |
| `inventory.transfer` | `inventory.stock.transfer` |
| `inventory.count` | `inventory.count` |
| `stock_request.create` / `stock_request.approve` | unchanged (already granular) |
| `accounting.view` / `accounting.post` | `accounting.journal.{view,post}` |
| `suppliers.manage` | `suppliers.{view,create,edit}`, `suppliers.payment.collect` |
| `purchasing.manage` | `purchasing.po.{view,create}`, `purchasing.receipt.create` |
| `purchasing.return` | `purchasing.return.{create,approve}` |
| `integrations.manage` | unchanged **+ all `*.export`** during transition (export was previously gated here, so no data becomes newly hidden) |

---

## 4. Axis 2 — Scope (per-assignment)

### 4.1 Dimensions (closed set)
`company · branch · region · area · own_customers · own_team`.

### 4.2 Per-assignment scope reference
Scope is a property of the **role assignment**, not the role:
```
ScopeRef := { dimension, set?: uuid[] }     // set = explicit branches/regions when not derived from membership
```
Defaults reproduce today exactly (the 5 currently scoped roles keep their present scope; everyone else `company`). An admin may override scope per assignment — e.g. give a `branch_manager` a `region` scope — **without cloning roles**. This is the primary anti-role-explosion lever alongside overrides and constraints.

### 4.3 `own_team` — transitive (whole subtree)
`own_team` includes **direct reports, reports-of-reports, and the full subordinate tree** — matching real FMCG sales-management structures. Traversal is a recursive closure over `erp_user_branches.reports_to`.

**Performance requirement:** the closure must be index-friendly for large orgs. Implementation must use a recursive CTE (or a maintained closure table) backed by an index on `reports_to`; benchmark before Phase 3. A maintained `erp_user_subtree` closure table is the recommended optimization if recursive CTEs prove costly at scale.

### 4.4 RLS mapping (onto existing columns)
| Dimension | Predicate basis |
|---|---|
| company | `company_id = erp_user_company_id()` |
| branch | `branch_id ∈ erp_user_branches` |
| region / area | `region_id / area_id ∈ user's managed set` |
| own_customers | `salesman_id = uid` or `route.rep_id = uid` |
| own_team | `salesman_id ∈ subtree(uid)` (transitive `reports_to` closure) |

Enforcement evolves the existing scoped-RLS functions (migrations `0104`/`0105`) from *inferring scope from role* to *reading the assignment's `ScopeRef`*. Write path stays company-wide-checked as today.

---

## 5. Axis 3 — Constraints / limits (first-class)

### 5.1 Typed constraints (attached to a Grant)
```
Constraint := { type, value, currency? }
types: discount.max_pct · approval.max_amount · credit.approve_max ·
       price.override_max_pct · return.approve_max_amount · writeoff.max_amount
```

### 5.2 Constraint → capability binding
| Constraint | Bounds |
|---|---|
| `discount.max_pct` | `sales.invoice.discount`, `sales.order.discount` |
| `approval.max_amount` | any `*.approve` |
| `credit.approve_max` | `customers.change_request.approve` (credit-limit changes) |
| `price.override_max_pct` | `sales.price.override` |
| `return.approve_max_amount` | `sales.return.approve` |
| `writeoff.max_amount` | `sales.payment.writeoff` |

### 5.3 Evaluation
At action time the capability must hold **and** every bound constraint must be satisfied by the request. Cross-currency comparisons normalize through the platform FX seam (`getFxRates()`, base SAR) so limits compare apples-to-apples.

### 5.4 Over-limit → workflow routing (not hard-fail)
If a request exceeds the user's limit, it **does not hard-fail** — it routes to the workflow engine, which escalates to the **lowest role whose limit covers the amount**. See §9.

---

## 6. Axis 4 — Field-level (Dynamic Field Governance)

Capabilities gate **sections/actions**; DFG gates **individual fields** (`hidden | view | edit | required`), already built (`erp_field_config` / `erp_field_access`, resolver `field-governance.ts`).

**Binding rule:** a capability *owns* a DFG section.
- `customers.edit.location` ⇒ Location section editable; DFG decides each field within it.
- `customers.financials.view` ⇒ Financials section visible as a unit.

`erp_field_access` already accepts both `role` and `permission` subjects, so granular capability keys plug in as `permission` subjects with **no new mechanism**. Admin-lockout protection (protected fields stay ≥ `edit` for `admin`/`it_admin`) carries over unchanged.

---

## 7. Per-user overrides (exception-only)

Roles remain the primary mechanism; overrides handle the rare exception that doesn't justify a new role.
```
override(u, capability) ∈ { grant, deny, — }
```
- **grant** opens a capability the user's roles lack — a narrow exception. A grant is *not* a bypass: the result still passes Scope (§4) and Limits (§5). Example: granting `customers.financials.view` to one salesman shows financials **only for customers already in their `own_customers` scope**.
- **deny** revokes a capability regardless of role/scope/limit. **Deny always wins.**
- Every override carries a **required reason** and is **audited** (§10).
- Precedence: `deny` > `grant` > `role default`.

---

## 8. Resolution order (canonical)

The decision is a sequential pipeline. Each stage may only restrict further, except the final stage which may also apply a narrow exception. `DENY` short-circuits.

```
1. ROLE PERMISSIONS  baseline capability from roles (∪ of all assignments, alias-expanded)
                     if action ∉ baseline AND no user-grant → DENY
2. SCOPE             restrict to visible rows (RLS)             row ∉ scope → DENY
3. LIMITS            bound by constraints           over limit → ROUTE TO WORKFLOW (escalate)
4. USER OVERRIDES    final exception gate:
                       deny(action)  → DENY     (wins over everything)
                       grant(action) → ALLOW the capability the role lacked (still via 2 & 3)
```

**Invariant:** `deny` beats `grant` beats `role default`.

### 8.1 Decision pseudocode
```ts
function authorize(u, action, row?, req?) {
  if (isSuperAdmin(u)) return ALLOW;

  // 1. Role baseline (+ alias expansion)
  const roleCaps = expandAliases(roleCapabilities(u));
  const ov = overrideFor(u, action);              // 'grant' | 'deny' | undefined
  if (!roleCaps.has(action) && ov !== 'grant') return DENY_CAP;

  // 2. Scope — applies to role caps AND granted exceptions
  if (row && !inScope(u, row)) return DENY_SCOPE;

  // 3. Limits
  if (req && !constraintsFor(u, action).every(c => c.ok(req)))
      return routeToWorkflow(u, action, req);

  // 4. Override deny is the final word
  if (ov === 'deny') return DENY_OVERRIDE;        // deny always wins

  return ALLOW;
}
```

---

## 9. Workflow routing rules

The constraint axis unifies *who can approve* with *up to how much*.

- Each approver role carries an `approval.max_amount` (per currency, FX-normalized).
- When an action's requested amount exceeds the actor's limit, an `erp_workflow_instance` is opened and the step's approver is the **lowest-ranked role whose limit ≥ requested amount**.
- Sequential escalation continues until a covering approver is found.
- Outcome application uses the existing pluggable `HANDLERS` registry (one handler per entity: customer onboarding, customer change request, credit-limit request, and — new — discount/return/writeoff approvals).
- Example: a Branch Manager (`return.approve_max_amount = 50,000`) approving an 80,000 return auto-routes to a Regional Manager whose limit ≥ 80,000.

---

## 10. Audit requirements

**Every change to the authorization model is mandatory-audited** — not only per-user overrides, but role→capability grants, scope assignments, and limit/constraint changes. All flow through the existing `erp_audit_logs` pipeline (feeds Platform → Audit Logs and the per-company Audit tab).

### 10.1 Common audit envelope
Every audited permission change records the same core fields:

| Field | Content |
|---|---|
| actor | who made the change (email + user id) |
| target | who/what the change applies to (role key, or user id) |
| subject | the thing changed (`module.resource.action` capability, scope dimension, or constraint type) |
| before → after | prior value → new value (full reconstruction; `null → x` on create, `x → null` on revoke) |
| reason | **required** justification (enforced in UI) |
| company_id, timestamp | tenant + when |

### 10.2 Audited entities & actions
| Entity | Covers | Actions |
|---|---|---|
| `role_permission` | role → capability grants (`erp_company_role_permissions`) | `grant · revoke` |
| `role_scope` | per-assignment scope (`erp_role_scope`) | `set · modify · clear` |
| `role_constraint` | limits/constraints (`erp_role_permission_constraints`) | `set · modify · clear` |
| `user_permission_override` | per-user grant/deny exceptions (`erp_user_permission_overrides`) | `grant · deny · modify · revoke` |

Worked examples of the `before → after` capture:
- `role_permission` — *actor* Admin · *target* role `supervisor` · *subject* `sales.return.approve` · `present → absent` · action `revoke`.
- `role_constraint` — *target* role `regional_manager` · *subject* `discount.max_pct` · `10 → 5` · action `modify`.
- `role_scope` — *target* assignment (user U, role `branch_manager`) · *subject* `dimension` · `branch[A] → region[R1]` · action `modify`.
- `user_permission_override` — *target* user U · *subject* `sales.invoice.discount` · `default → deny` · action `deny`.

### 10.3 Rules
- Every create/modify/revoke of a permission, scope, constraint, or override row writes one audit entry **in the same transaction** — no silent changes.
- `modify`/`revoke`/`clear` always capture **before→after** for full reconstruction.
- Overrides also surface in the matrix UI with an "exception" badge showing the granting admin, date, and reason; role/scope/constraint changes are reviewable in the audit log.
- **Optional, config-gated runtime audit:** log when a `deny`/`grant` override actually changed an authorization *outcome* at action time. Default **off** (volume); enable for high-sensitivity tenants.
- **Retention:** all permission-change audit is part of the audit trail and is **excluded** from the retention purge (consistent with `0119`).

---

## 11. Export permissions

Export follows the standard convention — **one export capability per module**, no global export:
```
customers.export   sales.export   inventory.export
returns.export     collections.export   reports.export
purchasing.export  accounting.export   suppliers.export   pricing.export
```
Every export action **respects Scope, Limits, and DFG** — a user can export only the rows they may see, only the fields they may view, within any applicable limit. There is no global "export everything" capability.

---

## 12. FMCG & future-industry examples

### 12.1 FMCG personas
| Persona | Capabilities (granular) | Scope | Constraints | Overrides |
|---|---|---|---|---|
| **Salesman** | `sales.order.create`, `sales.invoice.create`, `sales.payment.collect`, `customers.{view,create,edit.basic}`, `inventory.stock.view` | `own_customers` | `discount.max_pct=5`, `writeoff.max_amount=0` | — |
| **Branch Manager** | + `sales.*.cancel`, `sales.return.approve`, `inventory.stock.{adjust,transfer}` | `branch` | `approval.max_amount=50k`, `discount.max_pct=15`, `return.approve_max_amount=50k` | — |
| **Regional Manager** | commercial management across region | `region` | `approval.max_amount=250k` | — |
| **Accountant** | `accounting.journal.{view,post}`, `sales.payment.collect`, `customers.financials.view`, `*.export` | `company` | `writeoff.max_amount=1k` | **Deny** `sales.invoice.discount` |

### 12.2 Future-industry compatibility (no redesign)
The model absorbs new verticals by registering module trees from the same vocabulary:
- **Clinic:** `clinic.appointment.{view,create,cancel}`, `clinic.encounter.{create,edit}`, `clinic.prescription.create`, `clinic.export`. Scope `own_customers` → "my patients"; `own_team` → a department's doctors. DFG governs clinical fields.
- **Restaurant:** `restaurant.table.manage`, `restaurant.order.{create,edit,cancel}`, `restaurant.kitchen.view`, `restaurant.export`. Constraint `discount.max_pct` on `restaurant.order.discount`.
- **Logistics/3PL (hypothetical future):** `logistics.shipment.{view,create,dispatch}`, `logistics.pod.approve`, scope `own_team` for a dispatcher's drivers.
None of these require touching the axes — only a module registration plus optional DFG/constraint bindings.

---

## 13. Platform vs tenant (separation)

The platform-owner/provider permission system (`PLATFORM_PERMISSIONS`, `erp_platform_role_permissions`, `erp_platform_staff_permissions`) is **fully separate** from this tenant model: different subjects (provider staff vs tenant users), global (not per-company) grants, no row scope, owner is apex. This document governs **tenant** authorization only.

---

## 14. Data model (proposed — future, additive, backward-compatible)

| Table | Purpose | Notes |
|---|---|---|
| *(keep)* `erp_company_role_permissions` | role → capability | `permission` holds granular keys; legacy keys still valid via aliases |
| `erp_permission_aliases` *(new)* | legacy → granular map | read by `expandAliases` |
| `erp_role_scope` *(new)* | per-assignment scope | `(company_id, user_id, role_key, dimension, set jsonb)` |
| `erp_role_permission_constraints` *(new)* | typed limits | `(company_id, role_key, permission, constraints jsonb)` |
| `erp_user_permission_overrides` *(new)* | grant/deny exceptions | `(company_id, user_id, permission, effect, reason, created_by, created_at)`; mutations emit `user_permission_override` audit |
| `erp_user_subtree` *(optional)* | maintained `own_team` closure | performance optimization for transitive scope |

With zero new rows, the system behaves exactly as today (same safe-default principle DFG already uses). **Dual-read** during transition: checks accept legacy *or* granular keys.

---

## 15. Migration & backward-compatibility strategy

Production migrations are forward-only; rollback is via PITR (project rule). Each phase is independently shippable and reversible.

| Phase | Deliverable | DB? |
|---|---|---|
| **0** | This spec, signed off | none |
| **1** | Granular catalog + alias map (code); matrix shows groups; checks accept both keys | none |
| **2** | Split call-site checks (create / cancel / discount / export …) | none |
| **3** | Per-assignment scope + RLS predicate swap + transitive `own_team` | migration |
| **4** | Constraints + workflow amount-routing | migration |
| **5** | DFG field-section binding | none |
| **6** | Matrix UI redesign | none |

**Cutover safety test (mandatory):** for every seeded role, `expandAliases(legacy permissions)` must ⊇ the role's effective set today — automated assertion that *no role gains or loses access* at any phase boundary.

---

## 16. Risks & guardrails
- **Catalog discipline** — closed verb set; new verbs require a §3.2 amendment.
- **Cutover correctness** — the §15 regression test gates every phase.
- **`own_team` performance** — recursive closure must be indexed/benchmarked before Phase 3; optional closure table.
- **Constraint currency** — limits normalize via the FX seam; document each constraint's currency.
- **UX overwhelm** — default to role templates; granular controls via progressive disclosure.
- **Override sprawl** — overrides are exceptions; surface counts per tenant and review periodically (audit makes this possible).

---

## 17. Permissions UI (target UX)

This section is the authoritative reference for the **future** permissions screen (Phase 6, §15). It replaces the current flat role→permission checkbox matrix with a UI that exposes the full model. _Target UX, not yet built._

### 17.1 Top-level flow — Role → Scope → Limits → Overrides
The editor is organized as four tabs in **resolution order** (§8), so the UI mirrors how a decision is actually made:

```
┌─ Role: Sales Manager ──────────────────────────────  [ Save ] [ ⋯ ] ┐
│  ( Permissions )  ( Scope )  ( Limits )  ( Overrides )               │
└──────────────────────────────────────────────────────────────────────┘
```
- **Permissions** — role capabilities (Module → Resource → Action).
- **Scope** — the data-visibility boundary for this assignment.
- **Limits** — typed constraints bounding capabilities.
- **Overrides** — per-user grant/deny exceptions (administered per user, surfaced here for visibility).

### 17.2 Permissions tab — Module → Resource → Action
Capabilities render as a collapsible accordion: **Module → Resource → Action** (§3), with a per-capability **tri-state** control and group-level select-all.

```
Search: [ customers ▢ ]          Filter: ( All ) ( Granted ) ( Overridden )

▾ Customers
    View      ◉ inherit  ○ grant  ○ deny
    Create    ◉ inherit  ○ grant  ○ deny
    Edit      ◉ inherit  ○ grant  ○ deny
    Delete    ○ inherit  ○ grant  ◉ deny        ⛔ overridden
    Export    ◉ inherit  ○ grant  ○ deny
    Financials: View   ◉ inherit  ○ grant  ○ deny
▸ Sales        (Orders · Invoices · Returns · Payments)
▸ Inventory    (Stock · Adjustments · Expiry)
```

### 17.3 Tri-state semantics (inherit / grant / deny)
Each capability control has three states:
| State | Meaning |
|---|---|
| **inherit** | take the role default (or, at user level, the role-resolved value) |
| **grant** | explicitly allow |
| **deny** | explicitly forbid — **deny always wins** (§8) |

At **role** level the baseline is the role template; at **user** level the baseline is the resolved role set and grant/deny become **overrides** (§7).

### 17.4 Inherited vs overridden visualization
- **Inherited** values render muted/greyed with an "inherited" hint.
- **Overridden** values (anything not `inherit`) render bold with a colored badge — green **grant**, red **deny** — plus an "exception" tag at user level.
- A **filter** (`All / Granted / Overridden`) and the **search** box let an admin jump straight to what differs from defaults.
- A per-capability tooltip shows the resolution trace: `role default → override → effective`.

### 17.5 Scope tab — assignment scope UX
Single-select dimension with contextual pickers (§4):
```
Scope for this assignment:
  ○ Company (all)
  ◉ Branch        → [✔ Cairo Main] [✔ Giza] [+ add branch]
  ○ Region / Area → [ pick region/area ]
  ○ Own customers (salesman_id = user)
  ○ Own team      (whole reporting subtree)   ⓘ transitive
```
Scope is **per-assignment**, so the same role can carry different scopes for different users without cloning the role.

### 17.6 Limits tab — constraints UX
Typed constraint editors, each bound to the capability it limits (§5), with currency where relevant:
```
Discount limit        sales.invoice.discount     max [  5 ] %
Approval limit        *.approve                  max [ 50,000 ] [SAR ▾]
Credit approval       customers.change_request   max [100,000 ] [SAR ▾]
Return approval       sales.return.approve       max [ 50,000 ] [SAR ▾]
Write-off limit       sales.payment.writeoff     max [  1,000 ] [SAR ▾]
Price override        sales.price.override       max [  5 ] %
```
An inline note explains over-limit behavior: _"Requests above this limit are routed for approval (§9), not blocked."_

### 17.7 Overrides tab — per-user grant/deny
Lists this user's exceptions on top of their roles, exception-only by design:
```
User: Ahmed (Salesman)
  + Add override

  GRANT  customers.financials.view   reason: "covers VIP accounts"   by Admin · 2026-06-03
  DENY   sales.invoice.discount       reason: "under review"          by Admin · 2026-06-02
```
- Adding an override **requires a reason** (enforced) and writes an audit entry (§10).
- Deny rows show a "deny wins" hint; grant rows note that scope + limits still apply.

### 17.8 Role templates / presets
- **Create role from template** — start from a business-type preset (the existing `erp_business_type_roles` seeds) or clone an existing role.
- **Reset to template** — revert a role's capabilities to its preset, with a diff preview before applying.
- Presets reduce the need for bespoke roles; scope + limits + overrides absorb the variation.

### 17.9 Audit visibility
- Each tab surfaces a **"recent changes"** affordance linking to the audit log filtered to this role/user (entities `role_permission`, `role_scope`, `role_constraint`, `user_permission_override` — §10).
- Override rows show **who/when/why** inline.
- Any change shows a **before→after** preview on save (mirrors what gets audited).

### 17.10 Principles for the build
- **Progressive disclosure** — default to the role template; granular controls expand on demand so the screen isn't overwhelming.
- **Reuse shared primitives** — `SectionHeader`, `FormSection`, `EmptyState`, `ListSearch` (search/filter).
- **Bilingual + RTL** — all labels via i18n with ar/en parity (existing test gate).
- **No silent changes** — every mutation is auditable and reason-bearing where required.

---

## 18. Decision log
| Decision | Choice |
|---|---|
| Key convention | `module.resource.action` |
| Scope | per-assignment; dimensions company/branch/region/area/own_customers/own_team |
| `own_team` depth | transitive (whole subtree), index-friendly |
| Constraints | first-class axis (discount %, approval amount, credit, price override, return, writeoff); workflow auto-routing |
| Per-user overrides | grant/deny, exception-only, **deny wins** |
| Audit scope | **all** permission changes — role permissions, scope, constraints, overrides — with actor/target/before→after/reason/timestamp |
| Resolution order | Role → Scope → Limits → Overrides |
| Export | one capability per module; respects scope/limits/DFG; no global export |
| Field-level | Dynamic Field Governance (existing) |
| Platform tier | separate, out of scope |
| Permissions UI | tabs Role→Scope→Limits→Overrides; Module→Resource→Action accordion; tri-state inherit/grant/deny; inherited-vs-overridden visualization; templates; audit visibility (§17) |
