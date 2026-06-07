# VANTORA — Workflow Platform Decouple Plan (Option C)

**Goal:** land the **approved, frozen, web-only Workflow Platform** on `main`
**without** blocking on the Desktop RC stack (`feat/auto-updater` + #124), which has
an external macOS sign/notarize dependency.
**Mode:** Planning only. **No code, no branch changes, no PR changes.** Grounded in
local diff analysis of the three layers.

## Headline finding (decisive)

- **Workflow Platform → cleanly extractable.** Its 66 files are disjoint from the
  Desktop RC layers **except one** (`settings/workflows/page.tsx`, a full-file
  replacement) plus **one standalone dependency** (`src/lib/sync/server/impersonate.ts`,
  whose only imports are `node:crypto`, `@supabase/supabase-js`, `@/lib/supabase/config`
  — all already on `main`). Every other import it uses is already on `main`.
- **Offline Sync → partially entangled with Desktop RC.** Its *engine* is web-only,
  but its *write-seam call sites* (13 business-action files) are shared with #124's
  print/export edits, and #125's versions import desktop helpers (e.g.
  `@/lib/erp/print` in `cashier-terminal.tsx`) that are **not on `main`**. So Offline
  Sync cannot be lifted to `main` as cleanly as the Workflow Platform.

**Recommendation:** extract the **Workflow Platform alone** first (clean, low-risk,
ready now). Treat **Offline Sync** as a separate, later decoupling (it shares files
with Desktop RC). Both are flag-gated and inert, so neither blocks the other.

---

## 1. What belongs to the WEB PLATFORM path (extract to `main`)

### 1a. Workflow Platform — clean, ship now (the frozen deliverable)
**Code & tests**
- `src/lib/workflow/**` — engine/runtime/executors/builder/events/flags + all tests
  (runtime, runtime-deps, dispatcher, trigger-match, condition-eval, egress,
  executors/registry, builder/validation, builder/graph-model, flags).
- `src/app/(app)/settings/workflows/**` — `actions.ts`, `page.tsx`,
  `workflow-builder.tsx`, `workflow-canvas.tsx`.
- `src/app/api/internal/workflow-tick/route.ts`.
- `src/lib/i18n/messages/workflows.ts`.

**Migrations** (additive; STAGING-applied green): `0176`–`0184`
(`event_workflow_foundation`, `step_generalization`, `runtime_state`, `phase_a`,
`publishing`, `canvas_layout`, `run_claiming`, `step_effects`, `event_dispatch`).

**Docs**: `docs/architecture/workflow/**` (catalogs, architecture, completion
reports, reviews, plans, approval).

**Required standalone dependency (must be included)**
- `src/lib/sync/server/impersonate.ts` (+ `impersonate.test.ts`) — used by the
  tick; self-contained (no sync-engine imports).

**Dependency reconciliation (manual, small)**
- `package.json` / `package-lock.json`: add **only** `@xyflow/react`, `dagre`,
  `@types/dagre` on top of `main`'s versions (do **not** bring the Tauri/desktop
  deps that also live in these files on the desktop branches).
- `settings/workflows/page.tsx`: take **#125's full version** (it is a complete
  rewrite; the desktop-layer edit to the old "lite" page is superseded).

> All other imports the platform uses (`@/lib/supabase/server`, `…/service`,
> `@/lib/erp/auth-context`, `…/permissions`, `…/guards`, `@/lib/i18n/*`,
> `@/lib/supabase/config`) are **already on `main`** — verified.

### 1b. Offline Sync — web engine is clean, but call sites are entangled (defer/secondary)
- **Clean (web-only, disjoint from desktop):** `src/lib/sync/**` (36 files),
  `src/lib/offline/**`, `src/app/api/sync/**` (7 routes), `src/app/(app)/settings/sync/page.tsx`.
- **Entangled (shared with Desktop RC — cannot lift cleanly):** the 13 write-seam
  call sites — `market/pos/cashier-terminal.tsx`, `wholesale/order/wholesale-order.tsx`,
  `sales/invoices/{actions,invoices-manager,page}.tsx`,
  `sales/returns/{actions,returns-manager}.tsx`,
  `inventory/count/stock-count-manager.tsx`, `settings/store/store-form.tsx`,
  `fashion/actions.ts`, `app/(app)/layout.tsx`, `i18n/messages/{core,sales}.ts`.
  #125's versions of these also contain #124's print/export edits and import desktop
  helpers absent on `main`.

---

## 2. What belongs to DESKTOP RC ONLY (keep for later)

- **`feat/auto-updater` (231 files vs main):** `src-tauri/**` (Rust updater, plugins),
  release CI (`release.yml`, signing/version-sync scripts), offline runtime bundling
  (Postgres/PostgREST/Node sidecars), migrations `0168–0175`
  (print_settings/retail_analytics/backups/snapshot_inventory/offline_local_auth),
  `/settings/updates`, branding. *(Note: `0161–0167` are also not on `main`; the
  desktop track owns the `0161–0175` range.)*
- **#124 (37 files):** desktop RC fixes — offline launch (gateway/health/shutdown),
  auth/licensing (offline refresh, LicenseGate, activation), desktop I/O
  (`@/lib/erp/print`, native save/export, `TauriLinkInterceptor`).
- These require a **signed/notarized macOS build** to validate and stay on the
  Desktop RC track.

---

## 3. How to create a clean `main`-based PR for the Workflow Platform

*(Steps to execute later, after approval — not performed now.)*
1. Branch `workflow-platform-v1` **off `origin/main`**.
2. Bring the §1a file set onto it. Cleanest mechanism: **`git checkout
   origin/claude/offline-sync-architecture -- <paths>`** for the workflow paths +
   `src/lib/sync/server/impersonate.*` (this takes the final file contents directly,
   avoiding cherry-pick conflicts from the desktop ancestry).
3. Reconcile `package.json`/`package-lock.json` to `main` + the three npm deps
   (`npm install @xyflow/react dagre @types/dagre`).
4. Confirm migration ordering: `main` ends at `0160`; the platform adds `0176–0184`.
   The numbering **gap (0161–0175) is acceptable** for the sequential runner **iff**
   `0176–0184` don't reference objects from `0161–0175` (validation §6).
5. `tsc --noEmit` + full suite + `npm run build`; open a **Draft PR → `main`**.

**Expected PR structure:** ~66 files + `impersonate.*` + `package*.json`. All
additive; flag-gated (`KAKO_WF_*` default OFF); no edits to existing business-action
files → small, reviewable, independently revertible.

---

## 4. How to keep Desktop RC for later

- Leave `feat/auto-updater` and #124 **as-is** on their branches; do not retarget.
- Open the missing **`feat/auto-updater → main`** PR when desired; validate #124 via
  a signed/notarized macOS build on its own timeline.
- Offline Sync: keep with the Desktop RC stack **for now** (its write-seam shares
  files with #124). If it must ship independently later, do a **separate** decouple:
  lift the clean sync engine/API/console to `main`, then reapply the write-seam
  lines onto `main`'s business-action files (manual, since #125's versions carry
  desktop edits) — a higher-effort follow-up.
- After the Workflow Platform PR merges, #125 can be **closed or rebased** to drop
  the now-landed platform commits (keeping only Offline Sync) to avoid double-merge.

---

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Migration gap** — `0176–0184` on `main` without `0161–0175` | **High if unverified** | Validate the full `0176–0184` chain on a fresh `main`-based Supabase branch (§6); confirm no reference to `0161–0175` objects. |
| `impersonate.ts` needs an env/secret to function | Low | It mints a JWT from existing config; verify the tick path in staging with `KAKO_WF_*` flags. |
| `package-lock.json` drift on reconcile | Low | Regenerate via `npm install` on the clean branch; commit the lockfile. |
| Accidentally pulling an entangled file | Medium | Use the explicit §1a path list only; **exclude** the 13 write-seam files. |
| `settings/workflows/page.tsx` base differs on `main` | Low | Full-file replacement (take #125's version); no merge needed. |
| #125 left open after platform lands → double-merge | Medium | Close/rebase #125 to Offline-Sync-only post-merge (§4). |

---

## 6. Validation plan (before opening the PR)

1. **Migration chain (decisive):** create an isolated Supabase branch from `main`,
   apply `0176`→`0184` **in order, with nothing from 0161–0175**, confirm success +
   the schema-health invariants (every FK covered; no unwrapped `auth.uid()`).
   *(Prior testing validated `0182–0184` on a ~0160 replica + minimal preamble; the
   full `0176–0184`-on-`main` run is the remaining gap.)*
2. **Build/type/test:** `tsc --noEmit` clean; full vitest suite green (expect the
   workflow + flags + graph-model tests); `npm run build` clean (canvas lazy chunk).
3. **Import closure:** confirm no file on the extracted branch imports anything
   absent from `main` (grep for `@/lib/erp/print`, `@/lib/sync/*` beyond
   `server/impersonate`, Tauri APIs) → expect none.
4. **CI on the PR:** Typecheck & build, Integration tests (DB), **Apply migrations to
   STAGING** all green; flags default OFF ⇒ zero behavior change.
5. **Runtime smoke (staging, flags on):** enable `KAKO_WF_*` per the rollout plan and
   confirm tick/claim/dispatch behave.

---

## 7. Recommended steps (sequence)

1. **Run the migration-chain validation (§6.1)** on a throwaway `main`-based Supabase
   branch — this is the single most important gate. *(Decision: proceed only if green.)*
2. **Create `workflow-platform-v1` off `main`** and bring the §1a set (workflow +
   `impersonate.*` + reconciled `package*.json`). Exclude all §1b entangled files.
3. **Gate locally:** `tsc` + suite + build green.
4. **Open Draft PR → `main`** (small, additive, flag-gated). Let CI confirm
   STAGING migrate + tests.
5. **Merge when ready** (your call) — the Workflow Platform lands independently of
   Desktop RC.
6. **Post-merge housekeeping:** rebase/close #125 to Offline-Sync-only; keep the
   Desktop RC stack on its macOS track; plan the Offline-Sync decouple separately
   if/when it must ship on its own.

---

## Verification gaps (flagged, not assumed)

- The **full `0176–0184` on a pure `main` schema** has not yet been run end-to-end
  (only `0182–0184` + a preamble were branch-tested) — §6.1 closes this.
- `feat/auto-updater`'s exact divergence from `main` (and the owner of `0161–0167`)
  was not traced — relevant to the Desktop RC track, not to the Workflow extraction.
- No branch/PR/code changes were made. Planning only.
