# Dynamic Field Governance — Completion Report

*VANTORA platform-wide field governance · DFG-1 → DFG-3 complete and green (PR #81, migrations 0114–0117) · held for review. No merge, no production migrations.*

---

## 1. Completed capabilities

| Requirement | Status | Where |
|---|---|---|
| Field **visibility** (hidden) | ✅ | resolver + read redaction |
| **Editability** (view/edit) | ✅ | resolver + write enforcement |
| **Required** fields | ✅ | `access='required'`, enforced on save |
| **Ordering** | ✅ | `field_config.sort` |
| **Custom fields** | ✅ | existing `erp_custom_fields`, overlaid |
| **Conditional visibility** | ✅ | `field_config.condition` (record/company context) |
| **Role / permission access** | ✅ | `erp_field_access` (subject = role **or** permission, most-permissive merge) |
| **Company-level config** | ✅ | every table keyed by `company_id` (RLS) |
| **Audit (before/after)** | ✅ | `logAudit` on every config/access/section/version change |
| **Sections** (icons, help, collapsible, default state, ordering, mobile) | ✅ | `erp_field_sections` (0115) |
| **Search / filter / bulk / import-export / preview-as-role / reset** | ✅ | admin UI (DFG-2) |
| **Templates + copy (entity→entity, company→company PO-only)** | ✅ | `erp_field_templates` (0116) |
| **Draft / Publish** (resolver reads published snapshot) | ✅ | `erp_field_config_versions` (0117) |
| **Non-destructive rollback + change history** | ✅ | versions + audit |
| **Safe defaults** (no config = today) | ✅ | empty inputs → `edit` |
| **Admin lockout protection** | ✅ | resolver clamp + save-time guards + protected fields |
| **Customer form wired** (render + write + redact) | ✅ | DFG-3 |

**Migrations:** 0114 (config+access) · 0115 (sections) · 0116 (templates) · 0117 (versions). **Tests:** 325 unit (resolver, conditions, write-enforcement, lockout, layout) + 18 integration (RLS, tenant isolation, one-published invariant). tsc + build clean.

## 2. Remaining DFG capabilities

- **Field-value inheritance** (Head Office → Branch `inherit` / `inherit_locked`): the `inheritance` column exists, but the resolver does **not yet** apply value-inheritance or the `inherit_locked`→view clamp. (Completes FP-0 §10.5 in the engine.)
- **DFG-4+ per-entity rollout**: only **Customers** is wired. Suppliers, Products, Orders, Invoices, Returns, Visits, Routes, Warehouses, Approval Requests, Workflow Forms, Attachments Metadata still need form/action wiring (no schema change — engine is generic).
- **Fully data-driven renderer**: DFG-3 gates the existing hardcoded Customer fields and renders `erp_field_sections` metadata is not yet driving the form's section chrome (icons/collapsible). A registry-driven dynamic renderer is a follow-up.
- **Live-value conditional re-resolution** in the form: conditions currently resolve against the **saved** record; client re-resolution on field change isn't wired (a conditional field appears after save).
- **Company→company copy UI** (server action exists; needs a Platform-area screen with a company picker).
- **Section drag-and-drop** (up/down reorder shipped; DnD is the nicety).

## 3. Deferred (by design)

- **DB column-level read privileges** — app-layer redaction for the pilot (sufficient for a single trusted app); DB-enforced reads post-pilot if enterprise customers require it.
- **Approval-gated governance changes** (route config changes through an approval) — not requested.
- **Attachments-metadata / Workflow-form** field catalogs — register when those entities are rolled out.

## 4. Architectural risks

| Risk | Severity | Note / mitigation |
|---|---|---|
| **Publish/rollback are multi-step** (archive-then-insert), not one DB transaction | Low | tiny window; wrap in an RPC later |
| **Per-form governance adds queries** (published-snapshot lookup; **per-row redaction on the customer list**) | Med at large lists | covered by the UX/Perf review's large-list section; cache/precompute later |
| **Client conditions resolve against saved record**, not live edits | Low | UX nicety; server is authoritative |
| **Long unmerged stack** (#78 → #79 → #80 → #81) | Med | all green; needs an ordered review/merge plan |
| **Inheritance column present but inert** | Low | flagged above; don't expose `inherit_locked` in UI until wired |

## 5. Final DFG architecture

```
Field dictionary   : entity registry (entities.ts) + erp_custom_fields
Config overlay     : erp_field_config   (section, sort, active, sensitive, protected,
                                          default_access, condition, inheritance)
Access matrix      : erp_field_access    (subject = role | permission → hidden/view/edit/required)
Section chrome     : erp_field_sections  (label/icon/help/collapsible/default/order)
Lifecycle          : erp_field_templates (reuse/copy) + erp_field_config_versions (draft/publish/rollback)
Resolution (pure)  : resolveAccess → resolveLayout
                     applicability(condition) → company-active → most-permissive(role+permission)
                     → admin clamp ; effective source = published snapshot → live → registry default
Enforcement        : UI gating + server applyWriteAccess + read redaction ; tenant RLS authoritative
Invariants         : safe defaults · admin lockout · before/after audit · non-destructive rollback
```

## 6. Recommended next phase

1. **Full Platform UX / Navigation / Performance Review** (now — Platform Owner / Company Admin / Operational users; 13-point lens; Must-Fix / Should-Fix / Can-Wait).
2. **Field-value inheritance** wiring (completes FP-0 §10.5 in the resolver).
3. **DFG-4+ per-entity rollout** (Suppliers → Products → Orders → Invoices → …).

---

*Report only. Nothing merged, no production migrations. Production remains on hold.*
