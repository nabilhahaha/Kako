# VANTORA — Legacy Audit Report (Keep / Refactor / Archive / Delete)

> Review item #3. **Findings & recommendations only — nothing has been removed,
> archived, or refactored.** No action will be taken without explicit approval.
> Classifications include **cleanup impact** and **risk level**.

**Headline:** the codebase is **clean and intentional** (~50k LOC, 94 migrations,
13 runtime deps). No dead code, no orphaned files, no legacy antipatterns, no
per-industry/per-customer forks. **Zero files are recommended for deletion** on
risk grounds; the only removal candidate is one unused 28-line component (your
call). The real opportunities are **test coverage** and **splitting a few large
components** — both Refactor, both low-risk.

Method: read-only survey (Glob/Grep/Read) across `src/`, `supabase/`, `docs/`,
`public/`, and root config. Verified key claims directly (e.g. `ComingSoon`
unreferenced).

---

## Classification summary

| Class | Scope | Cleanup impact | Risk | Recommendation |
|---|---|---|---|---|
| **KEEP** | ~all app code, 94 migrations, 13 deps, all config, all docs | — | — | No change |
| **REFACTOR — tests** | ~6–10 lib modules untested | Higher confidence; safer change | **Med** (gaps, not bugs) | Add unit tests incrementally |
| **REFACTOR — size** | ~3–8 large `*-manager.tsx` | Readability/testability | **Low** (cosmetic) | Extract sub-components opportunistically |
| **ARCHIVE/DELETE** | `coming-soon.tsx` (28 LOC, unused) | −1 file, −28 LOC | **Low** | Delete on approval (or keep as a primitive) |
| **DELETE (forced)** | none | — | — | Nothing |
| **Migrations** | 94 applied | — | **Forbidden to delete** | Keep all (immutable) |

---

## 1. Dead / unused code — MINIMAL
- **No** `.bak/.old/.tmp` files, **no** commented-out code blocks, **no**
  TODO/FIXME/HACK/DEPRECATED markers.
- **Only unused file:** `src/components/shared/coming-soon.tsx` (28 LOC) —
  exported, imported nowhere (verified). **Risk: Low.** → **Archive/Delete** on
  approval, *or* keep it as a deliberate shared primitive (the integration
  landing tiles use an inline "Soon" chip, not this component).
- Small single-purpose libs (`integration-crypto.ts`, `platform-guards.ts`,
  `work-session.ts`) are used and essential → **Keep**.

## 2. Placeholders / stubs — INTENTIONAL (Keep)
- `/design` (design-system showcase), `/upgrade` (entitlement paywall →
  support), `/login` (redirect to landing modal) — all intentional, low-risk,
  **Keep**. No abandoned feature stubs.

## 3. Duplication / overlap — NONE problematic (Keep)
- 38 `*-manager.tsx` components are **pattern reuse**, not duplicates (each has
  unique schema/state/actions).
- Platform-staff vs company-staff managers are **intentionally separate** (different
  roles + RLS contexts) per product principles.
- **No** pre-design-system bespoke styling lingering (tokens used throughout;
  only intentional brand gradients).

## 4. Migrations — HEALTHY (Keep all; deletion forbidden)
- **94** migrations (0001–0094). Maintenance records present and expected:
  fix-ups (`0030/0038–0042/0063`), security revokes (`0070/0071`), RLS
  dedup/consolidate (`0072/0073`).
- Applied migrations are **immutable** — never delete/rewrite. The fix/revoke
  pattern is normal progressive hardening, not debt. **Risk of deletion: forbidden.**

## 5. Legacy vs current patterns — CLEAN (Keep)
- `erp_*` names are the **current** canonical schema, not legacy fields.
- **No** hardcoded `businessType ===` business-logic forks (only a setup-wizard
  null check). Customization flows through custom fields / entity framework /
  per-company config — compliant with `PRODUCT_PRINCIPLES.md`.
- Legacy `erp_companies` subscription fields are **intentionally synced** from the
  billing tables (transition compatibility) — Keep until Billing Phase 2 retires
  them (track under R4).

## 6. Dependencies — LEAN (Keep)
- 13 runtime deps, all used (`@supabase/*`, `react-query`, `recharts`, `sonner`,
  `zod`, `zustand`, `date-fns`, `lucide-react`, `next-themes`, Sentry, …). No dead
  packages. Dev deps all active.

## 7. Tests — COVERAGE GAPS (Refactor, Medium priority)
- ~22 test files; **core logic well covered** (permissions, billing, custom
  fields, integration/connectors, webhooks, import/export, i18n parity, sales
  calc, subscription, ETA).
- **Untested, higher-value libs to cover** (add tests; no rewrite):
  - **High:** `auth-context.ts`, `entities.ts`, `entity-actions.ts`,
    `guards.ts`, `audit.ts`.
  - **Medium:** `import-parse.ts`, `integration-ingest.ts`, `platform-guards.ts`.
  - **Low:** `navigation.ts`, `constants.ts`.
- App-layer (pages/managers) largely untested by design (Supabase-coupled);
  covered by Playwright smoke + DB integration tests. **Risk: Med** (gaps, not
  known bugs).

## 8. Large components — REFACTOR (Low priority, optional)
- A few large client managers (e.g. `organization-manager` ~920 LOC,
  `import-wizard` ~888 LOC, `rep-terminal` ~705 LOC). Extract sub-components for
  readability/testability. **Risk: Low** (pure refactor).

## 9. Config / docs — CLEAN (Keep)
- Config files all active; `.env.example` vars all intentional. Minor: 
  `NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR` is documented but not wired into
  `Sentry.init` (harmless default) → optional one-line tidy, **Keep**.
- Docs are comprehensive and current. *(Note: the survey listed a `DEPLOYMENT.md`
  that isn't present — deployment lives in `MAINTENANCE.md`/`STAGING.md`; no
  action needed.)*

---

## Recommended actions (on approval — none taken yet)

| Priority | Action | Class | Effort | Risk |
|---|---|---|---|---|
| 1 | Add tests: `auth-context`, `entities`, `entity-actions`, `guards`, `audit` | Refactor | Med | Med→Low |
| 2 | Add tests: `import-parse`, `integration-ingest`, `platform-guards` | Refactor | Med | Med→Low |
| 3 | Archive/Delete `coming-soon.tsx` (or keep as a primitive) | Archive/Delete | Trivial | Low |
| 4 | Extract sub-components from the largest managers | Refactor | Low–Med | Low |
| 5 | (Optional) wire `NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR` into Sentry.init | Refactor | Trivial | Low |

**Not recommended:** deleting any migration, any dependency, or any route/page —
all are in active, intentional use.

### Protected — never remove (standing constraint)
The following are **explicitly protected** and out of scope for any cleanup,
archive, or deletion — ever, unless separately and explicitly authorized:
- **All medical / clinic features** (clinic module, visits, clinical fields,
  appointments, doctor/reception flows).
- **The Egyptian Drug List** and pharmacy dispensing data/features.
- Any applied migration.

**Execution rule:** **no direct deletions.** Every approved cleanup action ships
as its **own separate, reviewable PR** (tests added or component split or the
single unused-file removal) — never bundled, never silent.

> Awaiting your decision on which items (if any) to execute. Removal/refactor
> happens only after you approve, as separate reviewable PRs.
