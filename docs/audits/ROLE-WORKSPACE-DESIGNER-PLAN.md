# Role Workspace Designer — Implementation Plan & Rollout Recommendation

A complete design package for the Role Workspace Designer (RWD): the surface registry, the overlay model, the Company-Admin experience, a formal security-validation argument, a phased effort estimate, and a final rollout recommendation. **No implementation is included — this is the design and the decision input only.**

The governing principle from the approved architecture: **RWD is an additive presentation overlay.** It can hide and reorder items a role is *already entitled to see*; it can never grant access. Permissions, feature flags, and entitlements remain the single source of truth.

---

## 1. Surface Registry

The registry is one declarative catalog that assigns a **stable ID** to every workspace item and carries the gate metadata that already exists in code. Nothing in the registry is a new authority — it points at existing `perm` / `module` / `flag` gates. Four surfaces are registered.

### 1.1 Registry entry shape

```
WorkspaceItem {
  id:        string          // stable, e.g. 'nav.requests'  (NEVER reused/renumbered)
  surface:   'nav' | 'widget' | 'quick_action' | 'request_type'
  labelKey:  string          // existing i18n key
  target:    string          // route or component key (informational)
  gate: {                    // COPIED from today's hardcoded gate — not new
    perm?:   Permission | Permission[]
    module?: string | string[]
    flag?:   string
    superAdminOnly?: boolean
  }
  defaultOrder: number       // natural order used when no override row exists
}
```

### 1.2 Menu items (`surface: 'nav'`)

Source today: `NAV_SECTIONS` / `BOTTOM_NAV_TABS` in `src/lib/erp/navigation.ts`. Each item already has `perm` / `module` / `flag`; Phase 0 only adds the `id`. Representative field/sales entries:

| id | labelKey | route | gate (existing) |
|----|----------|-------|-----------------|
| nav.today | nav.bottom.today | /today | (always) |
| nav.requests | nav.items.fieldRequests | /field/van-sales/requests | perm field.sales + flag platform.salesman_requests |
| nav.customers | nav.items.customers | /customers | perm customers.manage + module crm/sales |
| nav.collections | nav.items.collections | /collections | perm sales.collect |
| nav.invoices | nav.items.invoices | /sales/invoices | perm sales.sell |
| nav.journeyToday | nav.items.todayJourney | /field/journey | perm field.sales + module field_ops/distribution |
| nav.myReturns | nav.items.myReturns | /field/van-sales/my-returns | perm returns.create |
| nav.returnApprovals | nav.items.returnApprovals | /field/van-sales/approvals | perm returns.approve |
| nav.dayCloseApprovals | nav.items.dayCloseApprovals | /field/van-sales/day-close-approvals | perm day.close.* |
| nav.loadRequestsInv | nav.items.loadRequests | /inventory/requests | perm stock_request.create/approve + module warehousing |

The full registry enumerates every existing `NAV_SECTIONS` item; the table above is the representative slice that drives the Salesman / Supervisor examples in §3.

### 1.3 Dashboard widgets (`surface: 'widget'`)

Source today: literal arrays/JSX inside the dashboard pages (no IDs exist yet — Phase 0 introduces them). Inventory:

| id | labelKey | page | gate (existing) |
|----|----------|------|-----------------|
| widget.monthSales | dashboard.monthSales | /dashboard | (always) |
| widget.receivables | dashboard.receivables | /dashboard | (always) |
| widget.payables | dashboard.payables | /dashboard | (always) |
| widget.overdueInvoices | dashboard.overdue | /dashboard | (always) |
| widget.recentInvoices | dashboard.recentInvoices | /dashboard | (always) |
| widget.lowStock | dashboard.lowStock | /dashboard | (always) |
| widget.electricalRma | electrical.rma | /dashboard | perm electrical.rma |
| widget.todayStock | vanSales.steps.stock | /today | flag (stockMovementReport) |
| widget.todaySummary | vanSales.dailySummary.tile | /today | flag platform.daily_summary |
| widget.todayOffRoute | vanSales.offRouteTile | /today | (van sales active) |
| widget.todayStatement | vanSales.statementTile | /today | (van sales active) |
| widget.todayCustody | vanSales.custody.tile | /today | flag (dayCloseApproval) |
| widget.pharmKpis | pharmDash.* | /pharmacy/dashboard | module pharmacy |

### 1.4 Quick actions (`surface: 'quick_action'`)

Source today: the topbar `+` menu (`layout.tsx:163-170`) and the `/dashboard` and `/today` quick-link arrays. Inventory:

| id | labelKey | target | gate (existing) |
|----|----------|--------|-----------------|
| qa.addUser | quickActions.addUser | /settings/users | perm settings.users (or super admin) |
| qa.addBranch | quickActions.addBranch | /settings/branches | perm settings.branches |
| qa.addProduct | quickActions.addProduct | /settings/product-structure | perm product.edit |
| qa.import | quickActions.import | /settings/import | perm integrations.manage |
| qa.goLive | quickActions.goLive | /settings/go-live | perm integrations.manage |
| qa.fieldRequests | quickActions.fieldRequests | /field/van-sales/requests | flag + van sales + field.sales |
| qa.newInvoice | dashboard.qaNewInvoice | /sales/invoices | perm sales.sell |
| qa.collect | dashboard.qaCollect | /collections | perm sales.collect |
| qa.newCustomer | dashboard.qaNewCustomer | /customers | perm customers.manage |
| qa.receivePO | dashboard.qaReceivePO | /purchases/orders | perm purchasing.manage |
| qa.reports | dashboard.qaReports | /reports | perm reports.view |

### 1.5 Request types (`surface: 'request_type'`)

Source today: the hub `/field/van-sales/requests` (`requests/page.tsx`). The hub itself stays gated by `platform.salesman_requests` + `field.sales`; each type is registered with its existing per-type permission:

| id | labelKey | gate (existing) |
|----|----------|-----------------|
| req.load | vanSales.requests.load | perm stock_request.create |
| req.cashHandover | vanSales.requests.cashHandover | perm cash.handover.request |
| req.reopen | vanSales.requests.reopen | perm day.reopen.request |
| req.customer | vanSales.requests.kind.* | perm customer.request |

**Registry guarantees:** IDs are stable and never reused; an item with no registry entry is simply not overlay-managed (renders at code default); the registry holds *no* permission logic of its own — it references existing gates.

---

## 2. Workspace Overlay Model

The overlay is a thin company-scoped, role-scoped layer of **visibility** and **ordering** decisions, stored in one table and applied by one pure function.

### 2.1 Storage

```
erp_role_workspace (
  id           uuid pk,
  company_id   uuid not null references erp_companies(id) on delete cascade,
  role_key     text not null,        -- ROLE scope
  surface      text not null,        -- 'nav' | 'widget' | 'quick_action' | 'request_type'
  item_id      text not null,        -- references a registry id
  visible      boolean not null default true,
  sort_order   integer,              -- null = use registry defaultOrder
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  unique (company_id, role_key, surface, item_id)
)
```

- **No row = code default** (visible, natural order). The table is purely a set of *overrides*. A brand-new tenant with zero rows behaves exactly like today — fully backward compatible.

### 2.2 Visibility

- `visible = false` removes an item the role would otherwise see. `visible = true` (or no row) keeps it.
- Visibility is **subtractive only** — see §4.

### 2.3 Ordering

- `sort_order` reorders items *within a surface* for that role. Null falls back to the registry `defaultOrder`. Reordering never changes membership of the set.

### 2.4 Role scope

- Every override is keyed by `role_key`. Configuration is authored per role (Salesman, Supervisor, …), matching how admins reason about teams. A user with multiple roles receives the **union** of their roles' entitled items, then the overlay is applied per the user's resolved role set (visible if visible for any held role; order by the highest-ranked role's preference — a deterministic tie-break rule defined once).

### 2.5 Company scope

- Every override is keyed by `company_id`. Tenant A's curation never affects tenant B. RLS enforces this:

```
policy erp_role_workspace_rw on erp_role_workspace for all
  using (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  )
  with check ( ...same... );
```

This is the **verbatim shape** already proven on `erp_feature_flags` — no new policy concept.

### 2.6 Resolution (the only behavioral code)

```
resolveSurface(items, ctx, flags, overrides):
  entitled = items.filter(item => gatePasses(item.gate, ctx, flags))   // EXISTING, authoritative
  return entitled
    .filter(item => overrides.get(item.id)?.visible !== false)         // subtract only
    .sortBy(item => overrides.get(item.id)?.sort_order ?? item.defaultOrder)
```

`gatePasses` is exactly today's permission/module/flag check. The overlay touches only the two lines after it.

---

## 3. Admin Experience

### 3.1 Page

A single new page **`/settings/workspace`** (Company Admin only; same guard as `/settings/features`). Layout reuses the Authz console shell:

1. **Role picker** (left): the roles enabled for the company.
2. **Surface tabs** (top): Menu · Dashboard · Quick actions · Request types.
3. **Item list** (center): for the selected role + surface, every **entitled** item with a visibility toggle and a drag handle.

### 3.2 What the admin sees per item — three states

| State | Meaning | Control |
|-------|---------|---------|
| ✓ Visible | Entitled and shown | toggle ON (can switch OFF) |
| ✗ Hidden | Entitled but admin chose to hide | toggle OFF (can switch ON) |
| 🔒 Not available | Role is **not entitled** (permission/flag/entitlement denies) | shown greyed / read-only, **cannot be enabled** |

The 🔒 state is the visible proof of the security model: items the role cannot access are displayed as locked and the toggle is disabled — the admin literally has no control that grants access.

### 3.3 Worked example — Salesman

Entitled set (from permissions/flags), with example admin curation:

```
Salesman — Menu
  ✓ Today
  ✓ Customers
  ✓ Requests              (hub; types curated below)
  ✓ Collections
  ✓ My Returns
  ✗ Today Journey         (entitled, admin hid for this tenant)

Salesman — Request types
  ✓ Load
  ✓ Cash Handover
  ✗ Reopen Day            (admin hid — but see note)
  🔒 Customer Requests    (role lacks customer.request → cannot enable)
```

Note: a ✗ on "Reopen Day" hides the tile; if the role still holds `day.reopen.request`, the route remains server-accessible by direct URL (hiding is cosmetic — §4). To actually deny it, the admin uses the existing permission system, not RWD.

### 3.4 Worked example — Supervisor

```
Supervisor — Menu
  ✓ Approvals             (return / day-close approvals)
  ✓ Requests
  ✓ Team Performance
  ✗ Van Operations        (entitled, admin hid to declutter)
  🔒 Cashbox              (role lacks treasury.manage → cannot enable)
```

### 3.5 Auditability

Every toggle/reorder writes through a server action that records to the existing audit log (`updated_by`, `updated_at` on the row + an audit entry), mirroring `setFeatureFlag`.

---

## 4. Security Validation

**Claim:** RWD can only hide and reorder; it can never grant access; permissions, flags, and entitlements remain authoritative.

### 4.1 Structural proof (data + code)

1. **No grant column exists.** `erp_role_workspace` has `visible` (boolean) and `sort_order` (integer) only. There is no column that can add a capability, permission, route, flag, or entitlement. The schema is incapable of expressing "grant."
2. **The resolver is monotonic-subtractive.** `resolveSurface` computes `entitled = items.filter(gate)` *first*, then only `.filter(visible !== false)` and `.sort(...)`. Both post-operations map the entitled set to a **subset** (filter) or a **permutation** (sort). Neither can introduce an item not in `entitled`. Therefore output ⊆ entitled set, always.
3. **Gate logic is untouched.** `gatePasses` is the existing permission/module/flag check; RWD does not call into it, modify it, or pass it different inputs. The authoritative decision is computed exactly as today.
4. **Server enforcement is unchanged.** Each route/action keeps its own server-side permission check. Hiding a nav item does not remove the route's guard — a hidden-but-entitled route is still reachable by direct URL and still enforced server-side. RWD is presentation only and is **never** consulted as an access-control decision.
5. **RLS confines writes.** Only Platform Owner / super admin / the company's own admin can write `erp_role_workspace` rows, and only for their own `company_id`. A Company Admin cannot author overrides for another tenant.

### 4.2 What this guarantees

- A Company Admin **cannot** use RWD to give a role a screen, widget, action, or request type the role's permissions/flags/entitlements do not already allow. The 🔒 state in the UI is the user-facing manifestation of points 1–2.
- Removing RWD entirely (dropping the table) returns the system to today's behavior with zero security delta — proof that it adds no authority.

### 4.3 Explicit non-goal

RWD is **not** an access-revocation tool. To deny access, admins use the existing systems (deny-all capabilities, feature flags, entitlements). This boundary is documented in the admin UI so hiding is never mistaken for securing.

---

## 5. Effort Estimate

Effort in engineer-days (design + build + tests), assuming one engineer familiar with the codebase.

### Phase 0 — Registry & ID extraction (no DB, no behavior change)

- **Scope:** add stable `id` to every `NAV_SECTIONS` item; extract dashboard-widget and quick-action arrays into a registry module; register the 4 request types. Add a snapshot test asserting ID stability.
- **Complexity:** Low.
- **Risk:** Very low (pure refactor; outputs identical; covered by existing nav/i18n tests).
- **Dependencies:** none.
- **Effort:** ~2–3 days.

### Phase 1 — Overlay for nav only (table + resolver + RLS)

- **Scope:** create `erp_role_workspace` (idempotent migration) + RLS; implement `resolveSurface`; wire into the sidebar/bottom-nav builders behind a feature flag (`platform.workspace_designer`, default off). No admin UI yet — seedable/testable via fixtures.
- **Complexity:** Medium.
- **Risk:** Low–Medium (touches nav rendering; mitigated by default-off flag + "no row = today" invariant + integration tests including a schema-health pass for the new FK/RLS).
- **Dependencies:** Phase 0.
- **Effort:** ~3–5 days.

### Phase 2 — Extend overlay to widgets, quick actions, request types

- **Scope:** apply `resolveSurface` to dashboard pages, the topbar `+` menu, and the hub's type list.
- **Complexity:** Medium.
- **Risk:** Low (same proven resolver; per-surface wiring only).
- **Dependencies:** Phase 1.
- **Effort:** ~3–4 days.

### Phase 3 — Admin UI `/settings/workspace`

- **Scope:** role picker + surface tabs + visibility toggles + drag-reorder + server actions + audit + the 🔒 not-available state; reuse Authz console shell.
- **Complexity:** Medium–High (drag-and-drop UX, three-state rendering, optimistic save).
- **Risk:** Medium (UI surface area; no security risk by construction).
- **Dependencies:** Phases 0–2.
- **Effort:** ~5–7 days.

**Total:** ~13–19 engineer-days end to end. Phase 0 is independently shippable and de-risks everything after it.

---

## 6. Recommendation

**Rollout: Phase 1 after pilot.** Specifically:

- **During pilot — do nothing new** except, *optionally*, fold **Phase 0** (the zero-risk registry/ID refactor) into normal pilot hardening. Phase 0 changes no behavior, is fully covered by existing tests, and leaves the codebase better organized regardless of whether RWD ever ships. It is safe to land mid-pilot; it is not required to.
- **Phase 1 after pilot — build the RWD (Phases 1–3) as the first enhancement once the pilot is stable.** Reasoning:
  1. **Not pilot-blocking.** The pilot validates core workflows (sell, collect, day-close, requests). Per-role visual curation is a polish/scale concern, not a correctness concern — pilot users get a complete, working app today.
  2. **Better informed by pilot feedback.** The pilot will reveal *which* items each role actually finds noisy or missing. Building the Designer after that means the default curations ship correct, instead of guessing now.
  3. **Low risk, high operational value at scale.** Once multiple tenants onboard, "tailor each role's screen without code" becomes a real time-saver; during a single-tenant pilot it is premature.
  4. **Clean dependency order.** Phase 0 can ride along with pilot hardening; Phases 1–3 then proceed in a focused post-pilot block with no pilot pressure.

**Not recommended:** building the full Designer *before/within* the pilot (adds scope and a new admin surface while core flows are still being validated), or deferring it to a distant Phase 2 after pilot (it is cheap, additive, and provably safe — there is no reason to push it that far out).

**One-line answer:** Phase 0 is optional pilot-time housekeeping; the Role Workspace Designer itself is a **Phase 1 after pilot** item.
