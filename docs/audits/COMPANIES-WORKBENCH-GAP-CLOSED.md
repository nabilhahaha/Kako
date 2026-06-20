# Companies Workbench — Gap Closed (C-1…C-6) · Updated Matrix, Validation & Review

The Companies Workbench is now the **single primary company administration center**. The standalone `/platform/companies/[id]` page **redirects** into the workbench, so administration is no longer split. UX/reuse only — the workbench center renders the **existing `Company360`** for the selected company; every action and section is reused verbatim. No business-logic / permission / RLS / workflow change. Commit `2d470ad`.

---

## 1. Updated migration matrix

| Capability | Before (gap report) | Now | How |
|---|---|---|---|
| Identity / Profile | ✅ Migrated | ✅ Migrated | Company360 overview |
| Active / suspend | ✅ | ✅ | overview |
| Subscription end | ✅ | ✅ | subscription |
| **Trial presets / renew** | 🟠 Partial | ✅ **Migrated** | Company360 subscription |
| Plan + limits | ✅ | ✅ | subscription |
| Module entitlements | ✅ | ✅ | modules |
| Branches | ✅ | ✅ | overview/branches |
| **Users / Members** (create, assign, reset pwd, onboard admin) | 🔴 Not Yet | ✅ **Migrated** | Company360 users |
| **Roles** | 🔴 | ✅ **Migrated** | roles |
| **Permissions** | 🔴 | ✅ **Migrated** | permissions |
| **Packs** | 🔴 | ✅ **Migrated** | packs |
| **Integrations** (connections, API keys) | 🔴 | ✅ **Migrated** | integrations |
| **Audit** (full per-company trail) | 🟠 Partial | ✅ **Migrated** | audit |
| **Self-users toggle** | 🔴 | ✅ **Migrated** | overview |
| **Setup-done toggle** | 🔴 | ✅ **Migrated** | overview |
| Company-360 (KPIs/health/timeline) | 🟠 Partial | ✅ **Migrated** | the whole Company360 |

**Now: Migrated 16 · Partial 0 · Not Yet 0.**

---

## 2. Remaining gaps

- **None for parity.** Everything the old detail page did is in the workbench (it *is* the same `Company360`).
- **Intentional design choices (not gaps):**
  - The Companies tab navigation uses **Company360's own internal section nav** (rich, with KPIs/health/timeline) rather than the generic `EntityTabs`, and the center is **full-width** (no separate right context panel) because Company360 already carries audit/timeline. This is consistent with the Context-Panel evaluation (delivered separately).
  - `/platform/companies/[id]` is now a redirect; its sub-routes `/analytics` and `/view-as` are unchanged.

---

## 3. Validation report

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| Full suite | ✅ 1592 passed / 192 skipped |
| i18n parity + key-usage | ✅ passed |
| Production build | ✅ green — `/platform/companies` 20 kB (full detail); `/platform/companies/[id]` 498 B (redirect) |
| Logic / permissions / RLS / workflow | ✅ unchanged (Company360 + its actions reused verbatim) |

---

## 4. Final Companies Workbench review package

**Structure:** Left = companies list (search + virtualization-ready) + **Quick-create** (createCompany). Center = the selected company's **full Company360** (Summary/Health · Subscription · Users · Roles · Permissions · Modules · Packs · Integrations · Audit). URL-addressable (`?id=<company>&tab=<section>`); deep links from `[id]` redirect in.

**Capture points (live preview, `/platform/companies`):**
1. Company list + pick **Nile FMCG (DEMO)** → full Company360 loads; URL `?id=…`.
2. Navigate Company360 sections: Users (create/assign/reset-password) · Roles · Permissions · Modules · Packs · Integrations · Audit · Subscription (trial presets) · Self-users/Setup-done toggles.
3. Open an old deep link `/platform/companies/<id>?tab=integrations` → redirects to the workbench with Integrations focused.
4. Quick-create a company from the left.

**Capabilities:** identical to the former detail page — nothing lost, now reachable from one screen with the company list always visible.

---

## 5. Next

The Admin Workbench migration program continues per your order: **Settings → Integrations**. The Industry-Pack hierarchy and Navigation-Tree remain separate design-first workstreams. The **Context Panel (permanent vs collapsible)** evaluation is delivered as its own document.

Commit `2d470ad` on `claude/pilot-ux` (PR #319) · live on the preview.
