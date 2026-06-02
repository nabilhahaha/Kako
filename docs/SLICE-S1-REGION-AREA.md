# Slice S1 — Region + Area Entities — Design Review

> **Design for approval — no build yet.** First slice of the FMCG hierarchy
> program. Adds tenant-scoped **Region** and **Area** entities and links
> **branches** to them, forming the geographic backbone that the customer model
> (S3) and hierarchy scope (S4) depend on. Additive + idempotent; no architecture
> rewrite; protected verticals untouched; no impact on existing tenants.

---

## 1. Goal
Model the FMCG geography so management spans resolve:
`Company → Region(s) → Area(s) → Branch(es)`. NSM manages Regions, Regional
Manager manages Areas, Area Manager manages Branches (scope wiring is **S4**;
S1 only builds the entities + branch links).

## 2. Schema (migration `0099`, additive + idempotent)

### `erp_regions`
```
id uuid pk, company_id uuid → erp_companies (cascade),
name text, name_ar text,
manager_id uuid → erp_profiles (set null)   -- the NSM/Regional owner (optional)
is_active bool default true, created/updated, sort int default 0
UNIQUE (company_id, name)
```

### `erp_areas`
```
id uuid pk, company_id uuid → erp_companies (cascade),
region_id uuid → erp_regions (cascade),
name text, name_ar text,
manager_id uuid → erp_profiles (set null),
is_active bool default true, created/updated, sort int default 0
UNIQUE (company_id, name)
```

### `erp_branches` — additive links
```
ADD COLUMN region_id uuid → erp_regions (set null)
ADD COLUMN area_id   uuid → erp_areas   (set null)
```
(nullable → every existing branch is unaffected; can be assigned later.)

### RLS + triggers (same pattern as all tenant tables)
- `erp_set_company_id` BEFORE INSERT trigger; `erp_set_updated_at` on update.
- RLS: `erp_is_platform_owner() OR company_id = erp_user_company_id()` (read +
  manage). Identical to `erp_departments`/`erp_teams` (0077).

## 3. App layer
- **Entity registry:** register `region` + `area` (import/export/audit for free).
- **Permission:** reuse **`settings.branches`** (org structure perm) to manage
  regions/areas — no new permission needed for S1 (keeps it small; the new roles
  come in S2).
- **UI:** a simple management screen under **Settings → Organization** (or a
  `/settings/regions` + `/settings/areas`) — list + create/edit/deactivate, and a
  **region/area selector on the branch form**. Read-first + basic CRUD, matching
  existing org screens.
- **i18n:** new keys (ar/en parity) for region/area labels.
- **Types:** `Region`, `Area` in `types.ts`; `branch.region_id/area_id`.

## 4. What S1 deliberately does NOT do
- **No scope/RLS-by-hierarchy yet** (that's S4) — regions/areas are just data +
  links here; everyone who can see branches can see regions/areas.
- **No new roles** (S2). **No customer fields** (S3).
- Keeps the slice small, additive, and independently verifiable.

## 5. Verification plan (rolled-back live)
- Apply `0099` in a transaction on the production project → assert: tables exist,
  RLS enabled, branch columns added, triggers present, advisor 0 ERROR, **no
  existing branch/row changed** (region_id/area_id NULL for all current branches)
  → **ROLLBACK** → confirm zero residue.
- Unit: entity-registry resolves `region`/`area`; types compile.
- `tsc` / `next build` / `vitest` + i18n parity. **Production apply held for
  approval.**

## 6. No-regression guarantees
- Additive only (new tables + nullable columns). No existing row's meaning
  changes; `region_id`/`area_id` default NULL. Protected verticals untouched
  (they simply never use regions/areas). Existing tenants unaffected.

## 7. Decisions to confirm (S1)
1. **Manage under Settings → Organization** (reuse `settings.branches` perm) for
   S1 — *(recommended; new perms/roles arrive in S2)*?
2. **`manager_id` on region/area now** (nullable, wired to scope in S4) — keep, or
   defer to S4? *(Recommended: keep the column now, populate/enforce in S4.)*
3. **Migration number `0099`** (next sequential) — confirm.

*(S1 design — paused for your review. On approval I build S1 → tsc/test/build →
rolled-back live verification → draft PR → review package → your approval to apply
0099 + merge. Then S2.)*
