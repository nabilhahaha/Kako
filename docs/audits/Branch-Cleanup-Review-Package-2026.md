# Branch Archive / Delete Review Package (Post-Consolidation)

**Consolidation completed:** PR #311 (`claude/fmcg-sell-collect-loop`) merged into
`main` (merge commit `0c7bf69`), with the Supervisor review docs from #310 folded in.
Full test suite green on the merged tree (1540 passed). **No branch has been deleted
or archived** — this package is for your review before any cleanup, exactly as
requested.

---

## 1. Branch inventory (recomputed against the NEW main `0c7bf69`)

| Bucket | Count | Meaning | Verdict |
|---|---|---|---|
| **Active – trunk** `main` | 1 | Consolidated trunk (now contains FMCG + entitlements) | Keep |
| **Active – pilot SoT** `claude/fmcg-sell-collect-loop` | 1 | **0 unique commits vs main** (fully merged) | Keep as active dev branch |
| **Active – docs/secondary** `claude/form-builder-engine-h92fzd` | 1 | **Still holds unique code** (see §4) | **Archive** (not delete) |
| **Merged into main – no unique code** | 47 | Every commit already in main | **DELETE candidates** |
| **Unique code – not in main** | 231 | Hold commits not in main | **ARCHIVE candidates** |
| **Total** | 279 | | |

The full per-branch listing with flags is `Branch-Inventory-2026.csv` (delivered
earlier); the buckets above are the post-merge recomputation.

---

## 2. Delete candidates (safe — no unique code)

**47 branches** are fully merged into `main` (`git rev-list <branch> --not main` = 0).
Deleting them loses **nothing** — every commit is in `main`. These are the
`safe_to_delete = Y` rows in the CSV (the pre-merge 45 + 2 that became merged after
the consolidation).

> The **pilot branch** also now shows 0 unique vs main, so it is *technically*
> delete-safe — but we **keep it** as the active development branch.

## 3. Archive candidates (preserve commits first)

**231 branches + `form-builder-engine`** hold unique commits not in `main`. Before any
deletion they should be preserved as tags:
```
for each branch B:  git tag archive/<B> origin/<B> && git push origin archive/<B>
```
Most are 1-commit design/proposal/checkpoint branches; a few carry large unique
histories (`offline-sync-architecture` ~108, `vantora-printing-fix` ~65,
`feat/auto-updater` ~57) — never blanket-delete these without archiving.

---

## 4. Unique-code check

| Branch | Unique vs main? | Detail |
|---|---|---|
| `claude/fmcg-sell-collect-loop` (pilot) | **No (0)** | Fully merged into main — nothing lost if deleted (but keep as SoT) |
| `claude/form-builder-engine-h92fzd` (#310) | **Yes** | 3 unique items NOT in main: `src/app/(app)/forms/customer-data-update/actions.ts` (CODE), `VANTORA-FMCG-Readiness-Assessment.docx`, `VANTORA-Sell-Invoice-Collect-Design-Review.docx`. **Do not delete** — archive, or fold these in if still wanted. The Supervisor docs from #310 were already folded into main. |
| 231 other branches | Yes | Unique commits (designs/spikes/checkpoints) — archive before delete |

**Action item:** decide whether #310's `customer-data-update/actions.ts` + the two
readiness docx should be folded into main or archived. They were out of the
"documentation only" fold-in scope, so they remain only on #310.

---

## 5. Migration check  ⚠️ ONE ISSUE TO RESOLVE

- **320 migration files** now on `main`; FMCG governance present: `0333`–`0337`
  (V1 revoke, auditor seed, supervisor txn removal, treasury+settlement SoD, branch-
  manager settlement removal). All applied to vantora-staging already.
- **⚠️ Duplicate migration NUMBER `0265`:** the two history lines independently used
  `0265`:
  - `0265_entitlements_company_feature_writes.sql` (entitlements line)
  - `0265_van_sell.sql` (FMCG line)
  Both now sit in `main`. The **live pilot DB is unaffected** (every migration was
  applied directly), but a **fresh deploy** could mis-order or, if the runner keys on
  the numeric version, **skip one**. **Recommended fix:** renumber `0265_van_sell.sql`
  → a unique trailing number (e.g. `0338_van_sell.sql`) **only after** confirming the
  migration runner won't try to re-apply it to environments where it already ran. I
  have **not** changed it (renaming an applied migration is delicate — needs your call).
- No other duplicate numbers; sequence is otherwise contiguous.

---

## 6. Documentation check

- **85 files** under `docs/audits/` on `main`. All FMCG pilot audit deliverables are
  present, including: Cashier-Treasury-Role-Review, Collection-Reverse-Fix-and-Branch-
  Alignment, Branch-Inventory-and-Consolidation (+ CSV), Supervisor-Transaction-
  Permission-Removal (Impact + Implementation), and the role-review set.
- The two #310 readiness docx (`VANTORA-FMCG-Readiness-Assessment`,
  `VANTORA-Sell-Invoice-Collect-Design-Review`) are **not** in main (see §4).

---

## Recommended cleanup sequence (for your approval — nothing done yet)

1. **Resolve the `0265` duplicate** (renumber `0265_van_sell.sql`) — do this first.
2. **Decide #310's residual code/docs** — fold into main or accept archiving.
3. **Archive-tag** the 231 unique branches + `form-builder-engine` (`archive/*`).
4. **Delete** the 47 merged-into-main branches (no unique code).
5. **Then** delete the archived branches (commits preserved as tags).
6. **Keep:** `main` (trunk) and `claude/fmcg-sell-collect-loop` (active SoT).

**Nothing in steps 1–5 has been executed.** Awaiting your approval per item.
