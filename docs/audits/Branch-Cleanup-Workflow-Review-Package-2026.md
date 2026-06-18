# Branch Cleanup Workflow — Review Package

**File:** `.github/workflows/branch-cleanup.yml` (committed to `main`; **not triggered**).
A manually-dispatched GitHub Action that runs in CI with `contents: write`, so it has
the repo push rights the sandbox lacks. **Safe by default — it does nothing destructive
unless you explicitly ask it to.**

## How the safety requirements are met

| # | Requirement | How |
|---|---|---|
| 1 | **Default = Dry Run** | `mode` input defaults to `dry-run`; the execute-only steps are `if: mode == 'execute'`. Dry run just reports + uploads an artifact. |
| 2 | **Show archive / delete / tags** | A report step prints: *Archive tags to create*, *Branches to archive then delete*, *Branches to delete (merged)* — to the job Summary **and** an uploaded artifact. |
| 3 | **Explicit approval before deletion** | Two-key gate: you must select `mode = execute` **and** type the exact phrase `ARCHIVE-AND-DELETE` in `confirmation`. Mismatch ⇒ the gate step fails, nothing is deleted. (Optional: uncomment `environment: branch-cleanup` for a native Required-Reviewers approval too.) |
| 4 | **Hard-exclude main + pilot** | `KEEP_1=main`, `KEEP_2=claude/fmcg-sell-collect-loop` are skipped in the compute loop, asserted absent from both lists, and re-checked again immediately before each delete step. |
| 5 | **Verify tags pushed before deleting** | After pushing `archive/*`, a dedicated step `git ls-remote`-verifies **every** archive tag exists on the remote; **any** missing tag ⇒ abort **before** a single branch is deleted. |
| 6 | **Report artifact** | `actions/upload-artifact` uploads `cleanup-report.md` + `archive.txt` + `delete.txt` on every run (dry-run and execute). |
| 7 | **Rollback instructions** | Embedded in the report: `git branch <b> archive/<b> && git push origin <b>`. Archive tags are never auto-deleted, so they remain the permanent recovery point. |

## Execution flow (when you choose to run it)

```
Dry run (default)                 Execute (mode=execute + confirmation=ARCHIVE-AND-DELETE)
─────────────────                 ───────────────────────────────────────────────────────
1 compute lists (excl. keep)      1 compute lists (excl. keep)
2 build report                    2 build report
3 upload artifact                 3 upload artifact
4 STOP (no changes)               4 confirmation gate (phrase must match)
                                  5 create + push archive/* tags
                                  6 VERIFY all tags on remote  ← aborts here if any missing
                                  7 delete archived branches (40/批)
                                  8 delete merged branches
                                  9 verify only main + pilot remain
```

The lists are **recomputed live** against `origin/main` at run time (not hard-coded),
so the action is always correct even as branches change.

## How to use it

1. **Actions → "Branch Cleanup (archive + delete)" → Run workflow**, leave `mode =
   dry-run`. Review the **Summary** and the **artifact** (exact archive/delete lists).
2. When satisfied, **Run workflow** again with `mode = execute` and
   `confirmation = ARCHIVE-AND-DELETE`.
3. The run ends by printing the remaining heads — expect exactly `main` and
   `claude/fmcg-sell-collect-loop`. The report artifact documents everything done.

## Expected scope (from the current repo state)
- **Keep:** `main`, `claude/fmcg-sell-collect-loop`.
- **Archive + delete (~231):** unique-code branches incl. `form-builder-engine`,
  `release/pilot`, `staging-frontend`, `staging-provision`, `feat/auto-updater`,
  `fix/camera-live-only`, `chore/test-users`, and the `claude/*` session branches.
- **Delete only (~46):** branches fully merged into `main`.

> ⚠️ `staging-frontend` / `staging-provision` / `release/pilot` are in the archive set
> per "keep only main + pilot". They are preserved as tags first. If any backs a **live**
> deploy, remove it from `archive.txt` handling (or restore from its tag afterward).

## Not done
The workflow is **created only**. It has **not** been triggered; no tag/branch change
has occurred. Cleanup happens only when you dispatch it in execute mode with the
confirmation phrase.
