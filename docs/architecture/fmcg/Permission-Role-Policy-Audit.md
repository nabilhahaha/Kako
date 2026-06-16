# Permission & Role Policy — Audit & Design

**Status:** AUDIT / DESIGN ONLY — no implementation. Treats permissions as a dedicated workstream.
**Scope:** the FMCG roles, a complete permission + role + screen/action matrix, the gaps, and a phased plan with protection rules. Role Builder is **not** started here.

---

## 0. What already exists (build on this — don't reinvent)

The platform already has a real authorization stack:

- **Flat permissions:** 88 keys (`ALL_PERMISSIONS`) grouped (sales 18 · inventory 18 · field_ops 14 · settings 11 · accounting 6 · purchasing 3 · verticals …). Defined in `src/lib/erp/permissions.ts`.
- **Role catalog:** `erp_roles` + default grants `erp_role_permissions` (seed new companies) + **per-company grants `erp_company_role_permissions`** → custom company grants are *already* persisted.
- **Granular capability layer:** `capabilities.ts` (`can()`, `expandAliases()`) resolves `module.resource.action` from flat perms via `CAPABILITY_ALIASES`; **8 P6 deny-all capabilities** (`granular-capabilities.ts`): `customers.delete`, `sales.price.override`, `sales.payment.writeoff`, `purchasing.po.approve`, `inventory.adjustment.approve`, `sales.order.cancel`, `sales.invoice.cancel`, `accounting.voucher.approve` — deny-all until granted.
- **Admin surfaces:** "Global Roles" editor (`role-admin.ts`, platform) + Authz Console (`authz-console-server.ts`) + "dangerous permission" classification.
- **Apex:** `hasPermission` returns true for `isSuperAdmin || isPlatformOwner` (they hold everything).
- **Enforcement flags (default OFF):** `platform.rpc_authz_enforcement`, `platform.action_authz_enforcement`; money-path actions also carry an **always-on** gate (G1).

> Implication: a **Role Builder** is largely a UI over `erp_company_role_permissions` + the granular layer — not a new engine.

---

## 1. Permission inventory (FMCG-relevant subset)

| Group | Permissions |
| --- | --- |
| **Sales** | sales.sell · sales.discount · sales.collect · sales.return · pricing.view · pricing.manage · product.search · uom.manage · *(P6)* sales.price.override · sales.invoice.cancel · sales.order.cancel · sales.payment.writeoff |
| **Customers** | customers.manage · customers.approve · customers.change_status · customer.create · customer.edit · customer.import · customer.transfer · customer.request · customer.request.approve · *(P6)* customers.delete |
| **Inventory / Stock** | inventory.view · inventory.adjust · inventory.transfer · inventory.count · stock.view · stock.adjust · stock.transfer · stock.transfer.approve · stock_request.create · stock_request.approve · *(P6)* inventory.adjustment.approve |
| **Field / Van** | field.sales · field.attach_media · route.create/import · journey.create/import · visit.override_gps · visit.approve_out_of_route · day.close · day.approve_close_exception · day.reopen.request/approve/override · cash.handover.request/confirm · reconciliation.view/manage/approve · return.reason.manage |
| **Credit** | credit.request.create · credit.request.approve · *(via)* customers.change_status (credit-override gate) |
| **Reports / Targets** | reports.view · report.aggregate.view · target.view · target.manage |
| **Accounting** | accounting.view · accounting.post · *(P6)* accounting.voucher.approve |
| **Settings / Admin** | settings.branches · settings.users · settings.custom_fields · integrations.manage · workflow.manage |

**Feature flags (capability toggles, not permissions):** `collect_in_sell`, `visit_driven_route`, `smart_next_customer`, `day_reopen`, `unified_salesman_workspace`, `salesman_requests`, `credit_override`, `share_pdf`, `daily_summary`, `stock_movement_report`, `rpc_authz_enforcement`, `action_authz_enforcement` (all default OFF).

---

## 2. Role × Permission matrix (FMCG roles)

✓ granted · — not granted · **ALL** = every permission (apex/company admin).

| Capability | Salesman | Supervisor | Warehouse | Accountant | Branch Mgr | Company Admin | Platform Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| field.sales (van app) | ✓ | — | — | — | ✓ | ALL | ALL |
| sales.sell | ✓ | ✓ | — | — | ✓ | ALL | ALL |
| sales.discount | — | ✓ | — | — | ✓ | ALL | ALL |
| sales.collect | ✓ | ✓ | — | ✓ | ✓ | ALL | ALL |
| sales.return | — | ✓ | — | — | ✓ | ALL | ALL |
| customers.manage / change_status | ✓ / — | ✓ / ✓ | — | — / ✓ | ✓ / ✓ | ALL | ALL |
| credit override (flag + change_status) | — | ✓ | — | ✓ | ✓ | ALL | ALL |
| stock_request.create / approve | ✓ / — | — / ✓ | — / ✓ | — | — / ✓ | ALL | ALL |
| inventory.view / adjust / transfer | view | view | ✓ | view | view | ALL | ALL |
| reconciliation.view / manage / approve | view | manage | manage | — | manage | ALL | ALL |
| visit.approve_out_of_route | — | ✓ | — | — | ✓ | ALL | ALL |
| day.close / approve_close_exception | close | approve | — | — | approve | ALL | ALL |
| cash.handover.request / confirm | request | confirm | — | confirm | confirm | ALL | ALL |
| reports.view | — | ✓ | — | ✓ | ✓ | ALL | ALL |
| settings.users / branches | — | — | — | — | — | ALL | ALL |

(Apex = super-admin / platform-owner hold everything; **platform-owner** is the vendor tier — never a tenant role.)

---

## 3. Screen × Action matrix (current gate vs GAP)

Legend: **perm** = enforced today · **GAP** = no dedicated permission (rides on a coarse one) · **n/a** = not applicable.

### Customers
| Action | Today | Note |
| --- | --- | --- |
| View list | customers.manage | |
| Add | customer.create / customers.manage | |
| Edit | customer.edit | |
| Disable/block | customers.change_status | |
| View balance | **GAP** | shown to any viewer; no `customers.balance.view` |
| View credit limit | **GAP** | no `customers.credit.view` |
| Change credit limit | **GAP** | uses change_status/edit; no dedicated `customers.credit.manage` |
| Print statement | **GAP (print)** | no print permission anywhere |
| Delete | customers.delete (P6, deny-all) | |

### Sales
| Create | sales.sell + (G1 field.sales) | |
| Apply discount | sales.discount | |
| Override credit block | credit_override flag + customers.change_status | |
| Print invoice | **GAP (print)** | |
| Share invoice PDF | **GAP (share)** | rides on field.sales/share_pdf flag |
| Cancel invoice | sales.invoice.cancel (P6, deny-all) | |

### Collections
| Create | sales.collect (G1) | |
| Allocate | sales.collect | no separate allocate perm |
| Print receipt | **GAP (print)** | |
| Share receipt PDF | **GAP (share)** | |
| Cancel collection | **GAP** | no `sales.collection.cancel` (P6 covers writeoff, not cancel) |

### Returns
| Create | sales.return / field.sales (G1) | |
| Saleable return | **GAP** | not split yet (design) |
| Damage return | **GAP** | not split yet (design) |
| Approval required (policy) | **GAP** | Return-Approval design pending |
| Approve / Reject | **GAP** | proposed `returns.approve` |
| Edit approved qty | **GAP** | proposed |

### Inventory
| View van stock | inventory.view / field.sales | |
| View stock movement | inventory.view (+ flag) | |
| View warehouse stock | **GAP** | proposed `stock.warehouse_visibility` (Load-Request design) |
| Request load | stock_request.create | |
| Approve load | stock_request.approve | |
| Edit load request | **GAP** | proposed |
| Transfer stock | stock.transfer / inventory.transfer | |
| Adjust stock | stock.adjust / inventory.adjust (+ adjustment.approve P6) | |
| View expiry / damage | **GAP** | no expiry/damage data yet |

### Daily Summary
| View own | field.sales (+ flag) | |
| View team | reports.view (supervisor page) | not a dedicated scope |
| View all branches | **GAP** | no branch-scope permission tier |
| Print | **GAP (print)** | print page gated by reports.view/field.sales only |
| Export | **GAP (export)** | not built |
| Document drill-down | inherits doc-view perms | |

### Reports
| View own / team / company | reports.view (single tier) | **GAP**: no own/team/company scoping |
| Export | **GAP (export)** | |
| Print | **GAP (print)** | |

### GPS / Visit Compliance
| View distance / compliance % | **GAP** | Visit-Compliance design pending |
| Override GPS exception | visit.override_gps | exists |
| Approve out-of-location | visit.approve_out_of_route | exists |

### Admin / Configuration
| Manage users | settings.users | |
| Assign roles | settings.users | |
| Create custom roles | **GAP (UI)** | data layer exists (`erp_company_role_permissions`); no Company-Admin UI |
| Enable/disable feature flags | settings.users (feature config) | |
| Manage approval policies | workflow.manage | |
| Manage company settings | settings.branches / settings.* | |

---

## 4. Missing-permission gaps (consolidated)

1. **Cross-cutting action verbs absent:** no **Print**, **Share PDF**, or **Export** permissions anywhere — these ride on view/field.sales today. Recommend a small orthogonal set: `doc.print`, `doc.share_pdf`, `report.export` (or per-area variants).
2. **Customer financial visibility not separable:** balance / credit-limit view and credit-limit change have no dedicated perms (`customers.balance.view`, `customers.credit.view`, `customers.credit.manage`).
3. **Report/summary scoping is single-tier:** `reports.view` doesn't distinguish **own / team / company / all-branches**. Recommend a scope dimension (self < branch < company) rather than many flags.
4. **Cancel verbs partial:** invoice/order cancel exist (P6) but **collection cancel** is missing.
5. **Backlog-feature perms** (define when those features land): `returns.approve` / reject / edit-approved-qty (Return Approval); saleable/damage return (Damage split); `stock.warehouse_visibility` + load-request edit (Load Request v2); `visit.distance.view` / `compliance.view` (Visit Compliance).
6. **Company-Admin Role Builder UI** missing (data layer present).

---

## 5. System vs Custom roles

- **System roles (protected):** the `erp_roles` catalog + `ROLE_PERMISSIONS` defaults (salesman, supervisor, warehouse_keeper, accountant, branch_manager, admin, …). **Immutable structure**; their *grants* can be tuned at the platform tier only.
- **Custom roles (per company):** Company Admin **clones** a system role into a company-scoped role and adds/removes **allowed** permissions, persisted in `erp_company_role_permissions` (RLS-scoped to the company). Custom roles may grant **only** permissions the company itself is entitled to (its plan/modules) and **never** protected/security permissions.
- **Granular grants:** the P6 deny-all capabilities are grantable individually (least-privilege), so a custom role can, e.g., allow `sales.invoice.cancel` without granting all of sales.

---

## 6. Protection rules (hard invariants)

Company Admin **must NOT** be able to:
1. Edit or grant **Platform Owner / super-admin** capabilities (apex tier is vendor-only; not in any company role catalog).
2. Edit **system-protected** permissions (mark a `protected: true` set — e.g. settings.*, integrations.manage, workflow.manage, the authz-enforcement flags, P6 approval capabilities) — grantable only within policy, never removable from the security baseline.
3. **Access another company** — enforced by RLS (`erp_user_company_id()`); role edits are company-scoped rows.
4. **Disable core security permissions / enforcement** (e.g. turn off `rpc_authz_enforcement` once mandated, or remove always-on money-path gates).
5. **Bypass RLS** — all role/permission reads + writes go through RLS; the Role Builder is data-only over `erp_company_role_permissions`.

Recommend a `dangerous`/`protected` classification (already started in `role-admin.ts`) surfaced as warnings + hard blocks in the Company-Admin UI.

---

## 7. Recommended implementation phases

| Phase | Deliverable | Risk |
| --- | --- | --- |
| **P1 — Inventory + matrix (this doc)** | Authoritative permission inventory, role/screen matrices, gap list. | None (design). |
| **P2 — Orthogonal action perms** | Add `doc.print` · `doc.share_pdf` · `report.export`; gate Print/Share/Export across screens. Backfill defaults so existing roles keep current behavior. | Low (additive; default-grant to avoid regressions). |
| **P3 — Customer financial perms** | `customers.balance.view` · `customers.credit.view` · `customers.credit.manage`; gate balance/credit UI + change. | Medium (must default-grant to existing customer roles to avoid hiding data mid-pilot). |
| **P4 — Report/summary scoping** | self / branch / company scope on reports + Daily Summary; supervisor = branch, manager = company. | Medium (data-scope queries, RLS-aligned). |
| **P5 — Company-Admin Role Builder** | UI over `erp_company_role_permissions`: clone role, add/remove allowed perms, protection rules, audit. | Higher (governance UI; needs the protection invariants in §6). |
| **P6 — Backlog-feature perms** | Wire `returns.approve` etc. as those features (Return Approval, Damage split, Load Request v2, Visit Compliance) are implemented. | Tied to each feature. |

## 8. Risks & migration notes

- **Default-grant on rollout:** every new permission must be **seeded onto the roles that currently have the coarse permission** (e.g. anyone who could view a customer keeps balance view) — otherwise the pilot loses access overnight. Migrations are additive + idempotent.
- **Two enforcement flags are default OFF:** P2–P4 gates should be **always-on** for new perms (don't hide behind `action_authz_enforcement`) so they actually take effect — consistent with the G1 pattern.
- **Granular vs flat:** keep storing as `(role_key, permission)` rows so `expandAliases()`/`can()` continue to resolve; new perms added to `ALL_PERMISSIONS` (or as deny-all granular for sensitive verbs).
- **Apex untouched:** never add apex/platform-owner capabilities to a tenant catalog.
- **Reversibility:** each phase flag-gated where it changes visible behavior; rollback = revoke the new perms / drop the columns.

---

*Audit/design only. No code or schema changes. Implementation order to be decided after review; Role Builder (P5) not started.*
