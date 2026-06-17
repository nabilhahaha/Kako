# Branch Inventory, Classification & Consolidation Plan

**Scope:** all 279 remote branches of `nabilhahaha/Kako`. **Nothing is deleted or
archived by this document** — it is inventory + plan only, per instruction.

**Method:** for each branch we computed, from git, whether its commits are fully
contained in `main` (=> no unique code) and/or in the canonical pilot branch
`claude/fmcg-sell-collect-loop`. A full per-branch table (every branch, with last
commit, merged/unique flags, classification, and delete/archive verdict) is in the
companion file **`Branch-Inventory-2026.csv`**.

> **Legend / how to read the verdicts**
> - **Contains unique code = NOT merged_to_main.** If a branch's commits are all in
>   `main`, deleting it loses nothing.
> - **Deployment status:** only branches with an **open PR** get a Vercel preview.
>   Today that is **PR #311** (`claude/fmcg-sell-collect-loop`) and **PR #310**
>   (`claude/form-builder-engine-h92fzd`). **All other branches have no live
>   deployment.**
> - **Safe to delete = Y** only when the branch is fully merged into `main` (zero
>   unique commits). Everything else is **archive-first** (tag, then delete) so no
>   unique commit is ever lost.

---

## 1. Aggregate inventory

| Classification | Count | Contains unique code? | Deployment | Safe to delete now | Disposition |
|---|---|---|---|---|---|
| **Active – trunk** (`main`) | 1 | n/a (trunk) | none | No | Keep; becomes merge target |
| **Active – pilot SoT** (`claude/fmcg-sell-collect-loop`) | 1 | Yes | PR #311 preview | No | **Single source of truth** |
| **Active – docs/secondary** (`claude/form-builder-engine-h92fzd`) | 1 | Yes | PR #310 preview | No | Fold docs into pilot/main, then retire |
| **Legacy – merged into main** | 45 | **No** | none | **Yes** | Delete after pilot→main |
| **Documentation** (designs/proposals/checkpoints/guides) | 54 | Yes | none | No | **Archive by tag** |
| **Experimental** (phase/feature spikes, unmerged) | 177 | Yes | none | No | **Archive by tag** |
| **Total** | **279** | — | — | 45 | — |

**272 of 279 are auto-generated `claude/*` session branches** (one per AI task);
the 7 named branches are `main`, `release/pilot`, `staging-frontend`,
`staging-provision`, `feat/auto-updater`, `fix/camera-live-only`, `chore/test-users`.

---

## 2. The branches that actually matter (detailed)

| Branch | Purpose | Last commit | Deploy | Class | Unique code | Archive? | Delete? |
|---|---|---|---|---|---|---|---|
| `main` | Frozen trunk (2026-06-09); **behind the pilot** — lacks the FMCG van-sales suite | 5a56575 · 06-09 | none | Active-trunk | n/a | No | **No** |
| `claude/fmcg-sell-collect-loop` | **Canonical FMCG pilot** — van-sales + collections + reverse fix + nav + roles; migrations 0333/0334(/0335) | baea8bb · 06-17 | **PR #311 (live)** | Active-SoT | Yes | No | **No** |
| `claude/form-builder-engine-h92fzd` | Nav profiles, bottom-nav, supervisor perm change, **all audit docs**, migration 0335 — but **no pilot screens** | 06-17 | PR #310 | Active-docs | Yes | No | No (retire after fold-in) |
| `release/pilot` | Pilot release/readiness notes | 9044ba1 · 06-02 | none | Documentation | Yes (m+2) | Yes | No |
| `staging-frontend` | Staging deploy line (governance visibility fix) | 7371394 · 06-11 | none | Experimental | Yes (m+72) | Yes | No (verify not a live env first) |
| `staging-provision` | Staging provisioning scripts; **commits already in pilot** | cf8f5f1 · 06-10 | none | Experimental | In pilot | Yes | Yes (after pilot→main) |
| `feat/auto-updater` | Desktop offline auto-updater spike (uniq=57) | 9442ba5 · 06-06 | none | Experimental | Yes | Yes | No |
| `fix/camera-live-only` | Camera capture fix | — | none | Experimental | Yes | Yes | No |
| `chore/test-users` | `create-test-users.js` (8-role seeding) | 577c337 · 05-16 | none | Documentation/tool | Yes (m+1) | Yes | No (useful pilot tooling) |

> **Critical caveat:** `main` is **stale and behind** — it does **not** contain the
> FMCG pilot. Treat the **pilot branch** as the real codebase until pilot→main lands.

---

## 3. Consolidation plan

### Step 1 — Single active FMCG branch (DONE / standing)
`claude/fmcg-sell-collect-loop` is the **single source of truth**. All FMCG fixes,
role/permission/nav/workflow changes land here only (no more split work).

### Step 2 — Merge required FMCG into the future `main`
1. Open/loop **PR #311 (`fmcg-sell-collect-loop` → `main`)** and merge it. This
   carries: van-sales suite, collections + the reverse fix, nav profiles, role
   changes, and migrations **0333 / 0334 / 0335**.
2. **Fold in PR #310's docs** (the `docs/audits/*` set + any unique non-screen code).
   Simplest: cherry-pick the docs commits onto the pilot before the merge, OR merge
   #310 into the pilot first, resolve, then pilot→main.
3. **Post-merge verification (the 4 confirmations):** branch=`main`, deployment=
   production alias, environment, database=vantora-staging; and assert all three
   migrations + the supervisor/cashier permission state are present.

### Step 3 — Archive obsolete branches (no deletion)
For **every** non-active branch that holds unique code (the 54 Documentation + 177
Experimental + the named legacy ones), create a lightweight **archive tag** so the
commits survive branch deletion:
```
# for each branch B:  git tag archive/<B> origin/<B> && git push origin archive/<B>
```
This preserves designs, proposals, migrations, and experiments permanently as tags,
making the branches themselves disposable.

### Step 4 — Permanently delete without loss
- **Immediately safe (no unique code):** the **45 Legacy-merged** branches — their
  commits are already in `main`. (CSV `safe_to_delete=Y`.)
- **After Step 3 archiving:** the 54 Documentation + 177 Experimental branches become
  safe to delete (their commits live on as `archive/*` tags).
- **Keep:** `main`, `claude/fmcg-sell-collect-loop`; retire `form-builder-engine`
  only after its docs are folded in.

---

## 4. Risks / guardrails

- **Do not delete before pilot→main.** Until Step 2 lands, `main` lacks the FMCG
  pilot; deleting the pilot or its inputs would lose live functionality.
- **Archive-first for all 231 unique-code branches.** Several carry large unique
  histories (e.g., `offline-sync-architecture` uniq=108, `vantora-printing-fix`
  uniq=65, `feat/auto-updater` uniq=57) — never blanket-delete these; tag first.
- **`staging-frontend` / `staging-provision`:** confirm neither backs a live staging
  environment before any action (they look like deploy lines, not feature work).
- **Migrations:** verify `0333`,`0334`,`0335` exist as files on `main` post-merge
  (the DB already has them applied on vantora-staging).

---

## 5. What I did NOT do
No branch was deleted, archived, tagged, or merged. This is inventory + plan only.
The complete per-branch listing (all 279) is in `Branch-Inventory-2026.csv`.

**Recommended next action for your approval:** authorize **Step 2 (merge PR #311 →
main, fold in #310 docs)**; I will then propose the exact archive-tag + delete batch
(Steps 3–4) as a reviewable list before executing anything.
