# Branch Cleanup — Execution Report

## Honest status: PREPARED, not executed remotely (environment blocker)

The cleanup **could not be performed from this session**. The sandbox git proxy
authorizes pushes only to the session's working branches (`main` and
`claude/fmcg-sell-collect-loop` — which is why those pushes succeeded all along).
**Tag creation and branch deletion both return HTTP 403**, and the GitHub MCP exposes
**no delete-branch / create-tag** capability. So:

- ✅ **231 archive tags were created LOCALLY** (`archive/<branch>` → each unique-code
  branch tip).
- ❌ **They could not be pushed** to origin (`refs/tags/archive/*` → 403).
- ❌ **No branch could be deleted** (`push --delete` → 403).

To avoid any data-loss risk, **nothing was force-completed**. Instead, a **turnkey
script + exact lists** are committed so a maintainer (or CI) with full repo push
rights runs the cleanup in one shot.

## Run it (one command, from an environment with full push rights)
```
./scripts/branch-cleanup.sh
```
It (1) creates + pushes `archive/<branch>` tags for all 231 unique-code branches,
(2) deletes those 231 branches, (3) deletes the 46 fully-merged branches, (4) prints
the remaining heads (expected: `main`, `claude/fmcg-sell-collect-loop`).
Lists: `scripts/branch-cleanup-archive-then-delete.txt` (231),
`scripts/branch-cleanup-delete-merged.txt` (46).

---

## Final branch inventory (target end-state after the script runs)

| Category | Count | Detail |
|---|---|---|
| **Active branches (KEEP)** | **2** | `main` (consolidated trunk) · `claude/fmcg-sell-collect-loop` (pilot SoT) |
| **Archived (tag + delete)** | **231** | Unique-code branches → `archive/<branch>` tag preserves every commit, then branch deleted. Includes `form-builder-engine-h92fzd`, `release/pilot`, `staging-frontend`, `staging-provision`, `feat/auto-updater`, `fix/camera-live-only`, `chore/test-users`, and 224 `claude/*` session branches. |
| **Deleted (no tag)** | **46** | Fully merged into `main` (zero unique code — commits already preserved in `main`). |
| **Total processed** | 277 | (279 remote − `main` − pilot) |

### Confirmation on archive tags
- **Created successfully (locally): 231 / 231.** Verified each points at its branch tip.
- **Pushed to remote: 0** — blocked by the 403 described above. The script re-creates
  and pushes them when run with proper credentials. Until then the authoritative
  preservation of unique branches is the branch itself (still present on origin —
  nothing was deleted).

> Because **no deletion occurred**, no commit is at risk right now: all 279 branches
> still exist on origin exactly as before. The archive tags are only required at the
> moment of deletion, which the script does atomically (tag → push → delete).

---

## Safety guarantees in the script
- `main` and `claude/fmcg-sell-collect-loop` are **never** in either list (verified).
- **Archive-before-delete**: a unique branch is deleted only after its `archive/*` tag
  is pushed → fully restorable via `git branch <b> archive/<b>`.
- Merged branches carry no unique code (their commits are in `main`), so deleting them
  loses nothing even without a tag.
- ⚠️ **Note on infra branches:** `staging-frontend`, `staging-provision`,
  `release/pilot` are in the archive+delete set per "keep only main + pilot". They are
  preserved as tags, but if any backs a **live** staging/release deployment, restore
  it from its tag (or remove it from the list before running). Flagged for your
  awareness.

---

## Effort status
The consolidation **work** is done (PR #311 → `main`, docs folded in, migration
duplicate resolved, #310 residual reviewed). The **remote branch deletion/tagging** is
the only remaining mechanical step and is **blocked by sandbox permissions** — it
needs to be run from an environment with full push rights via the committed script.

**I cannot truthfully mark the branch-consolidation "closed"** until the script runs
and the remote shows only `main` + `claude/fmcg-sell-collect-loop`. Everything needed
to close it is committed.
