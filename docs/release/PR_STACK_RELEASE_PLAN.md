# VANTORA — PR Stack Release Plan (#125 → main)

**Mode:** Planning / analysis only. **No implementation, no code, no branch
changes.** Status verified from GitHub on the current heads.

**The stack (bottom → top), all open Drafts, all `mergeable_state: clean`:**

```
main
  └─ feat/auto-updater        (NO PR — desktop updater foundation)        ← bottom
       └─ #124 vantora-printing-fix   → feat/auto-updater  (+1,009 / −103, 37 files, 8 commits)
            └─ #125 offline-sync-architecture → vantora-printing-fix  (+14,533 / −372, 166 files, 43 commits)  ← top
```

> Key fact: **#125's branch history contains all of `feat/auto-updater` + #124's
> commits** (it was branched off them). So #125 "carries" the desktop layers in its
> ancestry, even though its *PR diff* is scoped against `vantora-printing-fix`.

---

## 1. What is currently in each layer

### `feat/auto-updater` (bottom — no PR to main)
The **desktop/offline runtime foundation** (Tauri v2): Rust auto-update core
(`updater.rs`), plugin wiring, tag-triggered **signed release workflow**
(`release.yml`), `/settings/updates` panel, version-sync scripts, full offline
runtime bundling (PostgreSQL/PostgREST/Node sidecars), `v0.1.0-beta.1`, branding
neutralization to "VANTORA". **Mostly `src-tauri/`, CI, scripts** + one web page.

### #124 `claude/vantora-printing-fix` → `feat/auto-updater`
**Desktop RC code-level fixes:** offline launch (gateway/health/shutdown), auth &
licensing (offline refresh, LicenseGate, activation), desktop I/O (native
print/save/export via Tauri plugins, link interceptor). +1,009/−103, 37 files.
Explicitly **"not for merge until a signed/notarized macOS build validates"** —
build/sign/notarize **cannot be verified in this Linux environment** (external
macOS + Apple-credentials dependency).

### #125 `claude/offline-sync-architecture` → `claude/vantora-printing-fix`
Two **web/server** workstreams, both additive and flag-gated:
- **Offline-first sync** (`KAKO_SYNC`, default off) — durable outbox, orchestrator,
  `/api/sync`, write-seam.
- **Workflow Platform V1 + V1.1** (this session) — engine/runtime/event-bus,
  Builder Phase 1 (forms) + Phase 2 (canvas), migrations `0176–0184` (additive,
  STAGING-applied green), hardening flags default OFF.
+14,533/−372, 166 files, 43 commits. `tsc` clean, suite green, STAGING migrate ✓.

---

## 2. Which branch should merge first

**Bottom-up is mandatory for a stack:** `feat/auto-updater` → #124 → #125. A higher
PR cannot reach `main` cleanly until the layer beneath it is in `main` (or it is
retargeted). **But** the bottom two layers (desktop) have an **external validation
blocker** (macOS sign/notarize) that the top layer (web platform) does **not**.

This is the crux: **the approved/frozen Workflow Platform is web/server-only and is
gated on desktop RC work it does not technically depend on.**

---

## 3. Stacked vs retargeted

- **Keep stacked:** simplest history, but couples the Workflow Platform's release to
  the desktop RC's macOS timeline.
- **Retarget #125 → main directly:** does **NOT** isolate the web platform —
  because #125's ancestry includes the desktop commits, a merge into `main` would
  bring **all three layers** in one ~166-file commit (unverified desktop code
  included). It collapses the stack rather than decoupling it.
- **Decouple (recommended, see §6):** put the Workflow Platform / offline-sync
  web changes on a **fresh branch off `main`** so they merge independently of the
  desktop RC. Requires later branch work (out of scope now) but is the only option
  that lets the frozen platform ship without the macOS blocker.

---

## 4. Risks of merging the current stack (bottom-up, as-is)

- **High — unvalidated desktop code on `main`.** `feat/auto-updater` + #124 contain
  Rust/Tauri shell + signing/runtime changes that were **never built/signed/
  notarized** here; #124 itself says "not for merge" until a macOS build validates.
- **Release coupling.** The CI-green, frozen Workflow Platform can't land until the
  desktop layers clear an external (Apple-credential) gate of unknown timing.
- **Large blast radius.** Once `feat/auto-updater`+#124 are in `main`, #125 still
  adds 166 files; a regression is harder to bisect across three mixed concerns.
- **`feat/auto-updater→main` has no PR** — an unreviewed entry point to `main`.

## 5. Risks of retargeting

- **Retarget #125 → main:** the diff **expands to the whole stack** (desktop +
  RC + web) in a single merge → same unvalidated-desktop risk as §4, **plus** a
  much larger, harder-to-review/rollback PR. Possible merge conflicts if `main`
  has moved.
- **Retarget #124 → main (skipping `feat/auto-updater`):** would pull the
  auto-updater commits in #124's ancestry into `main` anyway, and still carries the
  unverified-desktop risk.
- **General:** retargeting recomputes the diff against a different base; review
  approvals reset and conflict surface area grows with `main`'s drift.

---

## 6. Recommended path to reach `main` safely

**Decouple the frozen Workflow Platform (and offline-sync web work) from the desktop
RC.** Treat them as two independent releases:

1. **Verify independence first** (analysis, before any branch work): confirm the
   Workflow Platform + offline-sync **web/server** files in #125 have **no compile
   dependency** on `feat/auto-updater`/#124's `src-tauri/`/desktop symbols. (High
   confidence they don't — the platform is `src/lib/workflow`, `settings/workflows`,
   `0176–0184`, `/api/*`; desktop is `src-tauri/`/Tauri plugins.)
2. **Create a `main`-based branch** containing only the workflow + offline-sync web
   changes (rebase/cherry-pick the relevant commits), open a **clean, small-scoped
   PR → `main`**. This PR is additive + flag-gated + CI-green → **low-risk, fast to
   review, independently revertible.**
3. **Let the desktop stack proceed on its own track:** open the missing
   `feat/auto-updater → main` PR and validate #124 via a **signed/notarized macOS
   build** before merging — on the desktop RC's timeline, not blocking the platform.
4. **Order on `main`:** whichever is validated first merges first; they don't depend
   on each other. The Workflow Platform is ready now; the desktop RC waits on the
   macOS gate.

This honors the freeze (no platform changes — only how it lands) and removes the
external-dependency coupling.

*(All of §6 is a recommendation; executing it = branch work, which is out of scope
for this planning task and requires your approval.)*

---

## 7. Estimated effort & risk per option

| Option | Effort | Risk | Notes |
|---|---|---|---|
| **A. Merge stack as-is (bottom-up)** | Low git effort, **high external effort** (macOS build/sign/notarize) | **High** | Unverified desktop code → `main`; couples platform to Apple-cred timeline; #124 says "do not merge" yet. |
| **B. Retarget #125 → main, merge once** | Low | **High** | Collapses whole stack into one 166-file merge incl. unvalidated desktop; hard review/rollback. |
| **C. Decouple platform onto a `main`-based PR (recommended)** | **Medium** (rebase/cherry-pick + 1 clean PR; + open `feat/auto-updater→main` PR) | **Low** for the platform path; desktop risk isolated to its own track | Lets the frozen, CI-green platform ship now; desktop RC validated separately. |
| **D. Hold everything until macOS validation** | Low | Medium (opportunity cost) | Platform ships late for no technical reason; simplest but slowest. |

**Recommendation: Option C** — decouple. Lowest risk to `main`, ships the approved
Workflow Platform without waiting on the desktop RC's external macOS dependency, and
keeps the unverified desktop changes behind their own validation gate.

---

## Verification gaps (flagged, not assumed)

- I did **not** run a symbol-level dependency analysis of #125's web files against
  `feat/auto-updater`/#124 — recommended before any cherry-pick (Option C step 1).
- I did **not** verify `feat/auto-updater`'s divergence from `main` (no PR exists to
  compare); its actual delta vs `main` should be confirmed.
- No branch/PR changes were made. Status/planning only.
