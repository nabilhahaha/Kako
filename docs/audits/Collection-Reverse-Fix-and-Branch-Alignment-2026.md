# Collection Reverse Fix + Branch & Environment Alignment

## A. Collection Reverse — fix results

| Item | Result |
|---|---|
| Root cause | Two compounding defects: (1) the Reverse button in `collections-manager.tsx` rendered **unconditionally** — no role/permission check; (2) the server action `reverseCollection()` authorized on **`sales.collect`** — the same right used to *record* a collection, which the Sales Rep holds. So the rep both **saw** and **could execute** the reversal. |
| Permission gate now used | **`accounting.post`** (Finance/Accountant; admins & managers hold ALL). Recording a collection is unchanged (`sales.collect`); reversing now requires `accounting.post`. Both the server action and the UI check it (defence-in-depth). |
| Current user role | `salesman@pilot.test` -> role **`salesman`** (Sales Rep). `sales.collect` = true, `accounting.post` = false. |
| Sales Rep result | Reverse button **HIDDEN** (UI gated on `canReverse = accounting.post`) **and** server action **BLOCKED** (returns unauthorized). Runtime probe: `accounting.post` = false for salesman, supervisor, cashier. |
| Finance/Admin result | Reverse **VISIBLE + ALLOWED**. Runtime probe: `accounting.post` = true for accountant + admin. |
| Deployment URL tested | https://kako-git-claude-fmcg-sell-collect-loop-123456789-s-projects.vercel.app |
| Branch | `claude/fmcg-sell-collect-loop` (PR #311) |
| Commit hash | `3c238c1` (fix, Ready/Deployed) · `baea8bb` (branch alignment) |
| Tests | Full suite **1535 passed, 0 failed**; new SoD test in `mj1-posting-permissions.test.ts`. |

**Screenshot note:** the execution container has no outbound network egress, so an
authenticated browser screenshot cannot be captured. Proof is the rendered-source
gate (`canReverse` controls the button) plus the runtime DB authorization probe
acting as each real pilot account — the evidence standard used throughout this pilot.

### Permission-evaluation probe (vantora-staging, `erp_user_has_perm`)

| Account | Role | accounting.post (reverse gate) | Reverse |
|---|---|---|---|
| salesman@pilot.test | salesman | false | Hidden + Blocked |
| supervisor@pilot.test | supervisor | false | Hidden + Blocked |
| cashier@pilot.test | cashier | false | Hidden + Blocked |
| accountant@pilot.test | accountant | true | Visible + Allowed |
| admin@pilot.test | admin | true | Visible + Allowed |

---

## B. Branch & Environment Alignment verification

| # | Question | Answer (verified) |
|---|---|---|
| 1 | Branch with the active Collections implementation | `claude/fmcg-sell-collect-loop` — only branch with `collections/page.tsx`, `collections-manager.tsx`, `actions.ts`, and the full `field/van-sales/*` suite |
| 2 | Branch deployed to the URL being tested | `claude/fmcg-sell-collect-loop` — Vercel `get_deployment` confirms `branchAlias = kako-git-claude-fmcg-sell-collect-loop-...` maps to `githubCommitRef: claude/fmcg-sell-collect-loop`, PR #311 |
| 3 | Branch that received the Reverse fix | `claude/fmcg-sell-collect-loop` (`3c238c1`) — same branch as #1/#2 (aligned) |
| 4 | Environment/database the deployment uses | vantora-staging (`rsjvgehvastmawzwnqcs`) — hard default in `src/lib/supabase/config.ts`, confirmed by runtime logs reading pilot UUIDs |
| 5 | FMCG functionality on a different branch than the deployed pilot | Yes — `claude/form-builder-engine-h92fzd` (PR #310) holds the supervisor permission code change, `bottom-nav-tabs.ts`, migration `0335`, and the docs, but NONE of the pilot screens. Its preview is not a working pilot (those routes 404 there). |

### Drift found and remediation

- **Unifying layer = the database.** All three pilot migrations — `0333` (V1
  day-close revoke), `0334` (D1 auditor), `0335` (supervisor removal) — were applied
  directly to vantora-staging, so the live DB is correct regardless of which branch
  holds the files. This is why the pilot supervisor was already restricted.
- **Code drift (now fixed):** the supervisor code default still listed the four
  sales perms on the deployed branch (311); `baea8bb` removes them there and adds the
  `0335` file, so the deployed branch's code matches the DB + the approved policy.
- **Remaining drift / recommendation:**
  - Apply EVERY pilot fix to `claude/fmcg-sell-collect-loop` (PR #311) — it is the
    deployed pilot. Treat `form-builder-engine` (PR #310) as the docs/secondary branch.
  - `main` has neither the FMCG suite nor the migration files. Consolidation step
    before go-live: merge **311 -> main** (carrying 0333/0334/0335), then reconcile
    the 310 docs. Not yet done — flagged.

**Bottom line:** branch, deployment, and database are aligned — the tested URL
(`...fmcg-sell-collect-loop...`) runs `claude/fmcg-sell-collect-loop` against
vantora-staging, and now contains the Reverse fix.
