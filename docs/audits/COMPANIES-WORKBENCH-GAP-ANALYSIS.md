# Companies Workbench — Gap Analysis vs. Old Company Detail

Migration matrix between the **old Company Detail** (`/platform/companies/[id]`, still live and fully functional) and the **new Companies Workbench** (`/platform/companies`). Goal you set: the Workbench must become the **primary company administration center**, not a lighter summary. This matrix shows exactly what's left to fold in.

> **Important:** nothing has been *removed*. Every old capability still works on the `[id]` detail page. The gap is that the **Workbench** doesn't yet expose all of them — so today admins must bounce between the workbench (list) and the `[id]` detail. Closing the matrix makes the workbench the single center.

---

## 1. Migration matrix

| Capability (old Company Detail) | Old location | In Workbench? | Status |
|---|---|---|---|
| **Identity** (name, name_ar, business_type) | overview | Profile tab | ✅ **Migrated** (business_type as raw field; no picker) |
| **Active / suspend** | overview/subscription | Profile tab | ✅ **Migrated** |
| **Subscription end** | subscription | Profile tab | ✅ **Migrated** |
| **Plan select + limits** | subscription | Plans tab | ✅ **Migrated** |
| **Trial presets / renew shortcuts** (`setCompanyTrial`, renew 1m/1y) | subscription | — | 🟠 **Partially** (subscription-end date works; preset buttons missing) |
| **Module entitlements** (`setCompanyModule`, plan-lock) | modules | Entitlements tab | ✅ **Migrated** |
| **Branches** (list + add, activate) | (overview/branches) | Branches tab | ✅ **Migrated** (dedicated tab — improved) |
| **Users / Members** (create, assign branch, reset password, onboard admin, by-role view) | users | — | 🔴 **Not Yet** (lives on `[id]` + the Users workbench) |
| **Roles** (company roles enable/config) | roles | — | 🔴 **Not Yet** (on `[id]` + Roles workbench) |
| **Permissions** (company permissions matrix) | permissions | — | 🔴 **Not Yet** (on `[id]` + Roles workbench) |
| **Packs** (industry packs) | packs | — | 🔴 **Not Yet** |
| **Integrations** (connections, API keys, set-active) | integrations | — | 🔴 **Not Yet** |
| **Audit** (per-company trail, 100 rows) | audit | right-panel ActivityFeed (last 12) | 🟠 **Partially** (live feed yes; full filterable tab no) |
| **Self-users toggle** (`setCompanySelfUsers`) | overview | — | 🔴 **Not Yet** |
| **Setup-done toggle** (`setCompanySetupDone`) | overview | — | 🔴 **Not Yet** |
| **Company-360** (stacked overview/usage) | overview/`all` | summary only | 🟠 **Partially** |

**Summary:** Migrated 6 · Partially 3 · Not Yet 6.

---

## 2. Why the gap exists

The Workbench was built (per the approved Companies scope) as **Profile / Plans / Entitlements / Branches** — the four tabs you named — using a focused data load, deliberately **not** coupling to the large `CompanyDetail` component to keep risk low. That delivered the four tabs cleanly but left the other six `CompanyDetail` sections (Users/Roles/Permissions/Packs/Integrations/Audit + advanced toggles) only on the `[id]` page.

The existing `CompanyDetail` component is **already tab-driven** (`tab` prop renders one section), so folding the remaining tabs into the Workbench is reuse, not rebuild.

---

## 3. Plan to make the Workbench the primary center (no logic change)

Add the missing tabs to the Companies Workbench by **embedding the existing `CompanyDetail` sections** — same component, same actions, zero logic change:

| Step | Tab(s) to add | How (reuse) | Effort |
|------|---------------|-------------|--------|
| C-1 | Extract the `[id]` page data load into a shared `loadCompanyDetailData(supabase, id)` (pure move) | refactor, no behavior change | S |
| C-2 | **Users · Roles · Permissions** tabs | render `<CompanyDetail tab="users|roles|permissions" …/>` per tab | S each |
| C-3 | **Packs · Integrations** tabs | `<CompanyDetail tab="packs|integrations" …/>` | S each |
| C-4 | **Audit** tab | `<CompanyDetail tab="audit" …/>` (full trail) alongside the right-panel feed | S |
| C-5 | Advanced toggles (self-users, trial presets, setup-done) into Profile | reuse `setCompanyTrial`/`setCompanySelfUsers`/`setCompanySetupDone` | S |
| C-6 | Redirect `/platform/companies/[id]` → `/platform/companies?id=…&tab=…` (or keep as deep-link) | routing only | S |

Result: one Workbench with tabs **Profile · Plans · Entitlements · Branches · Users · Roles · Permissions · Packs · Integrations · Audit** — the full company admin center, every action reused, nothing lost. Estimated ~1–1.5 days.

---

## 4. Recommendation

Before continuing to Settings/Integrations, **close the Companies gap (steps C-1…C-6)** so the Workbench is the genuine primary company administration center — not a summary. This is pure UX/reuse (embed the existing `CompanyDetail` tabs + existing actions); no business-logic, permission, RLS, or workflow change.

**Proposed order:** finish Companies (C-1…C-6) → then resume the program (Settings → Integrations) → then the separate Industry-Pack and Navigation-Tree design workstreams.

Branches is already migrated (`02d4e6b`) and validated. On your approval I'll execute C-1…C-6 and re-deliver the Companies Workbench as the complete admin center.
