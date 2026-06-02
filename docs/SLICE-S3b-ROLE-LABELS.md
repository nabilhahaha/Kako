# Slice S3b — Company-Configurable Role Labels — Design Review

> **Design for approval — no build yet.** Lets each company customize the
> **displayed title** of a role (e.g. `salesman` → "Medical Rep", `regional_manager`
> → "NSM") while the platform keeps the **role key, permission template, and
> hierarchy rank** fixed. Same "tenant labels over platform-fixed keys" pattern as
> S3's customer master data. **Additive; zero regression** (no override → today's
> platform label). Companion to S4; **not** part of S3 (S3 = customer model).

---

## 1. Goal (from owner request)
Platform maintains the permission model + hierarchy logic; companies rename the
**visible** role titles to fit their industry. Example map:

| Platform role key (fixed) | Default label | Example company label |
|---|---|---|
| `national_sales_manager` | National Sales Manager | NSM |
| `regional_manager` | Regional Manager | Regional Manager |
| `area_manager` | Area Manager | Area Manager |
| `salesman` | Sales Rep | Medical Rep |
| `accountant` | Finance | Operations Finance |
| `admin` | Company Admin | Admin |
| `viewer` | Viewer | Viewer |

The **key** (permissions, rank, RLS in S4) never changes — only the label.

## 2. Grounding — how roles & labels work today
- **`erp_roles`** — GLOBAL catalog: `key (PK), name_ar, is_system, rank`. No
  `company_id`.
- **`erp_company_roles`** — per-company enablement: `(company_id, role_key,
  enabled)`, PK `(company_id, role_key)`. **This is the natural home for a label
  override.**
- **`erp_role_permissions`** (+ `ROLE_PERMISSIONS` in `permissions.ts`) — the
  permission template (platform-controlled). **Unchanged by this slice.**
- **App labels:** `BRANCH_ROLES` (`constants.ts`) maps key → bilingual label;
  `ROLE_RANK` (`auth-context.ts`) drives "top role". Used across the role UI,
  user forms, org screens.

## 3. Proposed design (additive)
**Migration 010x (additive):** add nullable override columns to
`erp_company_roles`:
- `label_en TEXT`, `label_ar TEXT` — null = use the platform default.

**Resolution helper** (one place, app-layer): `roleLabel(ctx, key, locale)` =
company override (`label_en`/`label_ar` for that company+key) **??** platform
`BRANCH_ROLES[key]`. Wire the role-display call sites through it (users/staff
forms, org chart, role pickers, permission matrix headers). The raw `key` stays
the value everywhere; only rendered text changes.

**Management UI** — **Settings → Roles** (or a "Labels" tab on the existing roles
screen), gated by the same permission that manages roles today (`settings.users`
/ super-admin): list the enabled roles, show the platform default, let the
company set/clear a custom `label_en`/`label_ar`. Clearing → falls back to default.

**i18n:** the platform defaults remain in `BRANCH_ROLES`; company overrides are
free-text data (not message catalog keys).

## 4. Scope discipline / safety
- **Permissions, ranks, RLS, role keys, seeding templates — all unchanged.** This
  is a **display-label** slice only.
- **Zero regression:** every existing `erp_company_roles` row has null overrides →
  identical labels to today. Companies that never customize see no change.
- Does **not** affect S4 scope logic (S4 keys off role *key*/rank, not label).
- Protected verticals unaffected.

## 5. Open decisions (S3b)
1. **Storage** — add `label_en`/`label_ar` to `erp_company_roles` (recommended;
   table already exists per-company) vs a separate `erp_company_role_labels`
   table? *(Recommend the columns.)*
2. **Editable scope** — labels for **all** roles, or only the FMCG sales-hierarchy
   roles (director/NSM/regional/area/branch/supervisor/rep)? *(Recommend all
   non-system roles; allow `admin`/`viewer` too but default-locked? confirm.)*
3. **Gating** — manage under **Settings → Roles** with `settings.users` (super
   admin), consistent with current role management? Confirm.
4. **Sequencing** — build S3b **after S4** (so the hierarchy is functional first),
   or before? *(Recommend after S4; it's pure cosmetics and independent.)*
5. **Custom NEW roles?** — this slice only **renames** existing platform roles. A
   company defining brand-new role keys (with permissions) is a **bigger, separate
   slice** (touches the permission model) — out of scope here. Confirm.

*(Design only — nothing built. On your answers I'll slice it after S4 per the
review-first process: design → build → tsc/test/build → rolled-back-live verify
(for the migration) → draft PR → approval. Migration held from production until
approved.)*
