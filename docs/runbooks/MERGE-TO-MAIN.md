# Merge-to-Main Runbook

> Procedure only — do not merge without explicit approval. Prepared `2026-06-04`.
> Grounded in verified git ancestry.

## Facts (verified `2026-06-04`)
- **Linear core stack:** `enterprise-readiness ⊂ fmcg-value-wave1 (#98) ⊂
  fmcg-bug-hunt (#99)`. The **`fmcg-bug-hunt` branch already contains all of
  Wave 1 + bug-hunt + the full doc/release package + the applied-`0118` record.**
- **`main` has diverged:** it holds **2 commits not in the chain** — `7b47b8b`
  (merge) and **`1c2d8dc`** (schema refactor: `visit_reasons_master` +
  `raw_data_mappings`, `applies_to`→booleans). Merge to main is **not** a
  fast-forward.
- **#100 (ai-strategy) / #101 (copilot-ai-v1)** were branched from an *earlier*
  `fmcg-bug-hunt` commit → they need a **rebase onto main** when the AI track
  resumes. **Parked.**

## Definitive merge order
1. **Reconcile `main` into the release branch first.** Merge `origin/main` into
   `claude/fmcg-bug-hunt` (or rebase), resolving conflicts around the
   `1c2d8dc` schema refactor (`visit_reasons`/`raw_data_mappings`). ⚠️ Likely
   conflict zone — review carefully.
2. **Re-run full CI** on the reconciled branch (tsc / vitest / `test:db` / build /
   E2E). Must be green.
3. **Merge the core to `main`** via the `fmcg-bug-hunt → main` PR. Because the
   stack is linear, this single merge delivers **both Wave 1 (#98) and bug-hunt
   (#99)**.
   - Review #98 and #99 for their respective diffs first (granular review), but
     deliver via the bug-hunt→main merge to avoid base-chain churn.
   - After this lands, **#98's content is fully included** → close #98 as merged/
     superseded; #99 is delivered.
4. **Deploy** the merged `main` (Vercel production) — see post-deploy checklist.
5. **AI track (later):** rebase `ai-strategy` (#100) and `copilot-ai-v1` (#101)
   onto the new `main`; keep flag OFF; merge per the AI Phase-2 decision.

## Pre-merge gates
- [ ] All 4 PRs green (✅ as of `2026-06-04`).
- [ ] `main` reconciled into the release branch; conflicts resolved; **CI re-run green**.
- [ ] Release commit SHA tagged/recorded.
- [ ] Production already on the `0118` fix (✅ applied) — no migration needed to deploy the core code.

## Notes
- The core code merge does **not** require applying the residual 42 migrations
  (the code in #98/#99 does not depend on them beyond `0118`, which is applied).
  Verify this assumption holds after reconciling `main`'s `1c2d8dc` (which touches
  the `visit_reasons`/`raw_data_mappings` schema area) — if the merged code starts
  to depend on a migration not in production, the **deployment gate** must catch it.
- Do **not** trigger `migrate-production`. Do **not** close the 42-migration drift
  as part of this merge.

## Post-merge
- [ ] Production smoke (invoice create, login AR/EN, key screens).
- [ ] Confirm Vercel production deployment READY on the merged commit.
- [ ] Update the ops log + Release Package status.
