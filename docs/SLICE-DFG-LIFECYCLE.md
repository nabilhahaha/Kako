# DFG — Templates, Copy, Versioning & Draft/Publish (Design Review)

*Extends Dynamic Field Governance (DFG-1/DFG-2). **Design only — no implementation**, no merge, no production migrations. Flagged where architectural changes are required, per request.*

> Goal: make field governance manageable **at scale across many companies** — reuse configs (templates/copy), see what changed (history), and change safely (draft → publish, rollback).

## 1. The six capabilities — classified

| # | Capability | Needs architecture? | Tier |
|---|---|---|---|
| 1 | Save configuration as **template** | New small store (snapshot) | A (light) |
| 2 | **Copy** config entity → entity | No — server action over existing tables | **A** |
| 3 | **Copy** config company → company (Platform Owner) | No — platform-owner-gated action | **A** |
| 4 | **Change-history viewer** | No — read over existing `erp_audit_logs` (we already log before/after) | **A** |
| 5 | **Draft vs Published** mode | **Yes** — a published snapshot the resolver reads, separate from the working/draft copy | **B** |
| 6 | **Rollback** to a previous version | **Yes** — versioned snapshots + restore | **B** |

**Tier A** is implementable now with no change to the DFG-1 read path. **Tier B** introduces a snapshot/versioning layer and changes what the resolver reads — that's the architectural decision to confirm before building.

## 2. Tier A — no architectural change (build-ready)

### Copy entity → entity / company → company (#2, #3)
A server action reads the source's `erp_field_config` + `erp_field_access` + `erp_field_sections` and upserts them onto the target (key-by-key), **lockout-checked and audited** (one `field_config` audit entry with the copy scope).
- entity → entity: same company, `settings.custom_fields`.
- company → company: **Platform Owner only** (`erp_is_platform_owner()`), since it crosses tenant isolation — the one place that's allowed to.

### Change-history viewer (#4)
DFG already audits every config/access/section change with `{ before, after }` to `erp_audit_logs` (entities `field_config` / `field_access` / `field_section`). A read-only viewer (filter audit by these entities + the selected entity key) shows **who changed what, when, old → new** — no new storage.

### Save as template (#1)
A lightweight additive table:
```
erp_field_templates(id, company_id NULL, name, scope_entity, snapshot jsonb, is_global bool, created_by, created_at)
```
`snapshot` = the same `{ config, access, sections }` JSON the export action already produces. Templates can be company-scoped or **global** (Platform Owner) for cross-company reuse. "Apply template" = the import path. *(This reuses the export/import JSON shape shipped in DFG-2.)*

## 3. Tier B — versioning, draft & publish (architectural — decision needed)

The current model edits the **live** `erp_field_config/access/sections`, which the resolver reads immediately → every change is effectively "published." Draft/Publish + Rollback require a **version layer**.

### Proposed model — config version snapshots
```
erp_field_config_versions(
  id, company_id, entity,
  version_no int,
  status text check (status in ('draft','published','archived')),
  snapshot jsonb,              -- { config[], access[], sections[] }
  label text, note text,
  created_by, created_at, published_at
)
unique (company_id, entity, version_no)
```
- The **live tables remain the working/draft copy** (what admins edit in DFG-2).
- **Publish** snapshots the live state into a new `published` version (and archives the prior published one). 
- **The resolver reads the active published snapshot** (materialized), falling back to the **live tables → registry defaults** when no published version exists — so **safe defaults are preserved** (no published version ⇒ behaves exactly as today / as the live draft).
- **Draft mode** = edit live freely; nothing affects users until Publish.
- **Rollback** = mark an older version `published` again (and optionally copy its snapshot back into the live tables).
- **History** = the version list (coarse) + the audit log (granular before/after).
- **Templates** become a version with no company binding; **copy** applies a snapshot to another entity/company.

This unifies all six features around one **snapshot** concept.

### The architectural change to confirm
Switching the resolver from **live tables** to **published snapshot (with live fallback)** is the one meaningful change to DFG-1's read path. It is additive and safe-default-preserving, but it changes *when* edits take effect (on publish, not on save). Two options:

- **Option B1 (recommended):** resolver reads the published snapshot; live = draft. True draft/publish + rollback. Requires DFG-3 (the customer form) to read the published layout.
- **Option B2 (lighter):** keep the resolver on live tables (edits stay immediate); add versions **only** for history + rollback (snapshots on publish/save; rollback restores into live). No real draft isolation, but no resolver change.

## 4. Recommended phasing

- **DFG-2c (Tier A, build-ready):** copy entity→entity, copy company→company (Platform Owner), change-history viewer, save/apply template. No resolver change, additive (`erp_field_templates` only).
- **DFG-2d (Tier B, after decision):** `erp_field_config_versions` + draft/publish + rollback, resolver reads published snapshot (Option B1) or history-only (Option B2).

## 5. Decisions for your confirmation

- **L1.** Proceed with **Tier A now** (copy ×2, history viewer, templates). → *Recommend.*
- **L2.** Draft/Publish model: **Option B1** (resolver reads published snapshot; safe-default fallback) vs **B2** (immediate edits + history/rollback only). → *Recommend B1.*
- **L3.** Company→company copy and **global templates** are **Platform-Owner-only** (cross-tenant). → *Recommend.*
- **L4.** Rollback restores a snapshot as the new published version (non-destructive — old versions retained/`archived`). → *Recommend.*

---

*Design only. Nothing implemented, nothing merged, no production migrations.*
