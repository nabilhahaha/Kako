# VANTORA — Legacy Cleanup Plan (post-B2)

> Execution plan for the **deferred** Legacy Audit recommendations
> (`LEGACY-AUDIT.md`). Each item below is a **separate, reviewable PR** — never
> bundled, never a silent/direct deletion. Presented for review; **nothing is
> executed until you approve each PR.**

## Protected assets — unchanged by every cleanup PR
Confirmed out of scope for all CP PRs (no edits, no removals):
- **Clinic** features · **Pharmacy** features · **Egyptian Drug List**
- **Distribution** features · **Electrical Retail & Wholesale** features
- Any applied migration; any dependency; any route/page in active use.

Every CP PR will state "protected assets untouched" and show a diff scoped only
to its files.

---

## Cleanup PR units (each reviewed separately)

| PR | Scope | Type | Risk | Effort | Source change? |
|---|---|---|---|---|---|
| **CP1** | Remove unused `src/components/shared/coming-soon.tsx` (28 LOC, verified unreferenced) | Delete | **Low** | Trivial | 1 file removed |
| **CP2** | Add unit tests for **pure** lib: `entities.ts`, `guards.ts`, `import-parse.ts`, `navigation.ts` | Tests | **None** | Low | **No** (tests only) |
| **CP3** | Add unit tests for server-coupled lib (mocked): `auth-context.ts`, `audit.ts`, `entity-actions.ts`, `integration-ingest.ts`, `platform-guards.ts` | Tests | **Low** | Medium | **No** (tests only) |
| **CP4** *(optional)* | Split large managers into sub-components — `organization-manager` (920 LOC), `import-wizard` (888), `rep-terminal` (705). One PR each. | Refactor | **Low** (behavior-preserving) | Med | Yes (no behavior change) |
| **CP5** *(optional)* | Wire `NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR` into `Sentry.init` | Refactor | **Low** | Trivial | 1 line |

### Recommended order
**CP1 → CP2 → CP3**, then optionally **CP4** (one manager per PR) and **CP5**.
CP1–CP3 are the high-value, low-risk core (a removal + real test coverage on
critical paths the audit flagged). CP4/CP5 are maintainability polish.

### Verification per PR
- `tsc` + `next build` + full vitest green (tests **increase**, never regress).
- CP1: confirm zero references before removal (already verified) + build green.
- CP4: behavior-preserving — same rendered UI/flows; rely on existing + new tests
  and a build.
- Each lands as a draft PR with its own review package; merged only on approval.
  No production DB change in any CP (all code-only).

### Notes
- Test PRs (CP2/CP3) **add** files only — they cannot break existing behavior and
  directly address the audit's `auth-context / entities / guards / audit` coverage
  gap.
- CP4 explicitly avoids the protected vertical managers (clinic/pharmacy/
  distribution/electrical); it targets only the three large generic managers
  listed.

*(Cleanup Review — paused for your approval. On go-ahead I'll execute the
approved PRs one at a time, each reviewed separately, before the SAP design
review.)*
