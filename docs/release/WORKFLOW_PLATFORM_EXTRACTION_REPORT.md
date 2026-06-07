# VANTORA — Workflow Platform Extraction Report (Option C)

**Goal (met):** a **clean, `main`-based** Workflow Platform branch/PR, fully
decoupled from the Desktop RC stack and from the Offline Sync write-seam.
**Branch:** `claude/workflow-platform-v1` (off `origin/main` @ `690afa5`).
**Scope honored:** Workflow Platform + Builder + Canvas + Templates + Versioning +
Simulation + Hardening (`0176–0184`). **Excluded:** Desktop RC, Tauri, Auto-Updater,
print/export desktop integrations, Offline Sync write-seam.

---

## 1. What was extracted (64 files + 3 npm deps)

Taken from `origin/claude/offline-sync-architecture` onto a fresh `main` branch:
- **Engine/runtime/builder:** `src/lib/workflow/**` (engine, runtime, executors,
  builder/validation, builder/simulate, builder/graph-model, dispatcher, events,
  emit, egress, condition-eval, trigger-match, repository, flags + all tests).
- **UI:** `src/app/(app)/settings/workflows/**` — `actions.ts`, `page.tsx`,
  `workflow-builder.tsx` (forms), `workflow-canvas.tsx` (React Flow canvas).
- **Tick:** `src/app/api/internal/workflow-tick/route.ts`.
- **i18n:** `src/lib/i18n/messages/workflows.ts` (ar/en).
- **Migrations:** `0176–0184` (foundation, step generalization, runtime_state,
  phase_a, publishing/versioning, canvas layout, claiming, step effects, dispatch).
- **Docs:** `docs/architecture/workflow/**`.
- **Standalone dependency:** `src/lib/sync/server/impersonate.ts` (+ test) — the only
  non-workflow file the platform needs (used by the tick); self-contained
  (`node:crypto`, `@supabase/supabase-js`, `@/lib/supabase/config`).
- **npm deps:** `@xyflow/react`, `dagre`, `@types/dagre` (reconciled onto `main`'s
  `package.json`/lock; no Tauri/desktop deps brought).

Already present on `main` (unchanged, not re-extracted): the `workflow.manage`
permission, the `/settings/workflows` nav entry, and the `workflows` i18n
registration in `messages/index.ts` (the prior "Workflow Builder Lite" shipped
these). #125's versions of the 4 lite files were overlaid; everything else is new.

---

## 2. What was explicitly EXCLUDED (and stayed out)

- **Desktop RC / Tauri / Auto-Updater** (`feat/auto-updater`, #124): `src-tauri/**`,
  release/signing CI, `/settings/updates`, offline runtime bundling — none brought.
- **Print/export desktop integrations** (`@/lib/erp/print`, native save dialogs,
  `TauriLinkInterceptor`) — none brought.
- **Offline Sync** (`src/lib/sync/**` engine, `src/lib/offline/**`, `/api/sync/**`,
  `/settings/sync`) and its **write-seam** call sites in POS/wholesale/invoices/
  returns/stock-count/store-form/fashion — none brought.

Verification: the staged set contains **only** workflow paths, the migrations, the
docs, and `sync/server/impersonate.*` — confirmed by path filter.

---

## 3. Cross-layer coupling severed

One coupling was found and cleanly removed: #125's `settings/workflows/page.tsx`
called `requireNonRetailAdmin()` from `@/lib/erp/guards` — a guard added by the
**lower desktop-RC/retail-hardening layer**, **absent on `main`**, and **not part of
the Workflow Platform** (#125 never modified `guards.ts`). The page already enforces
`hasPermission(ctx, 'workflow.manage')`, so the extra gate was dropped (import + call
removed). No other workflow file referenced a desktop/offline-sync symbol —
confirmed by a clean `tsc` (full import closure resolves on `main`).

---

## 4. Validation (same gates as before — all green)

- **`tsc --noEmit`** — clean (after clearing stale `.next/types` from the prior
  branch).
- **Full unit/integration suite** — **745 passed / 24 skipped, 0 failed**; the
  Workflow tests run on this branch (10 files, **77 tests**, verified explicitly).
- **Production build** — clean; `/settings/workflows` **11.9 kB** (React Flow
  lazy-chunked, not in the initial bundle), `/api/internal/workflow-tick` built.
- **Migration chain (`0176–0184`)** — the files are **byte-identical** to those
  validated last turn on a **pure-main Supabase branch**: applied in order with
  zero errors, FK-coverage invariant clean (0 uncovered), no unwrapped `auth.uid()`
  (0), all objects present. That validation applies directly to this branch (same
  baseline, same SQL). CI's "Apply migrations to STAGING" will re-confirm on the PR.

---

## 5. Resulting PR structure

- **Base:** `main`. **Head:** `claude/workflow-platform-v1`.
- **Diff:** additive — new `src/lib/workflow/**`, new `workflow-canvas.tsx`, new
  migrations `0176–0184`, docs, `impersonate.*`, +3 npm deps; plus in-place
  replacement of the 4 "lite" workflow files with the full versions.
- **Flag-gated:** `KAKO_WF_CLAIM` / `KAKO_WF_IDEMPOTENT` / `KAKO_WF_DISPATCH_SWEEP`
  default **OFF** → zero behavior change on merge until rollout.
- Small, reviewable, independently revertible; **not** coupled to the macOS desktop
  validation.

---

## 6. Desktop RC & Offline Sync — untouched

`feat/auto-updater` and #124 are **unmodified**; #125 remains as-is. After this PR
merges, #125 can be rebased/closed to Offline-Sync-only to avoid double-merge (a
later, separate task — not done here). Offline Sync stays with the Desktop RC track
per its write-seam entanglement.

---

## 7. Status

Extraction complete and validated. **Stopping for review** before opening/merging.
No Desktop RC or Offline Sync changes were made; no existing business-action files
were touched.
