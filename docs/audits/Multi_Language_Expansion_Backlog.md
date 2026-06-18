# Multi-Language Expansion — Future Roadmap Item (backlog)

**Status:** Roadmap / backlog only — **not started; design-first when scheduled. Do not implement now.** Recorded 2026-06-18. Sequenced **after P5 Customer Workbench** (current priority remains P5).

## Goal
Expand the platform beyond the current **Arabic / English** bilingual model to support the broader **GCC workforce**, with **company-level** language enablement and per-user selection — without regressing the existing i18n discipline (symmetric ar/en catalogs, no hardcoded labels, RTL correctness).

## Target languages
| Language | Code | Direction |
|----------|------|-----------|
| Arabic | `ar` | **RTL** |
| English | `en` | LTR |
| Hindi | `hi` | LTR |
| Urdu | `ur` | **RTL** |
| Filipino / Tagalog | `fil` (or `tl`) | LTR |

## Requirements captured (verbatim from direction)
1. **Do not implement now.**
2. Keep **all new screens i18n-ready** (every label via `t(...)`; no hardcoded UI strings).
3. **Avoid hardcoded UI labels** — enforced by the existing keys-usage test + review.
4. **Continue i18n symmetry tests** — every locale's catalog must have the same key set.
5. **Design for company-level enabled languages** — a tenant enables a subset; users pick from the enabled set.
6. **Support RTL where needed** — especially **Arabic and Urdu** (the layout already flips on `dir`; Urdu joins the RTL set).
7. **Load only the selected language bundle**, not all languages at once (per-locale code-split / lazy import, not one mega-catalog).
8. Add a **future review** for: translation-file **structure**, **fallback language**, and **missing-key detection**.

## Current baseline (what already helps)
- All UI strings already route through `t(...)` with per-module namespaces under `src/lib/i18n/messages/*` (`ar` + `en` exports), assembled by `messages/index.ts`.
- **Symmetry is already tested** (`i18n.test.ts`) and **key usage is already tested** (`keys-usage.test.ts`) — these extend naturally to N locales.
- RTL is **data-driven by `dir`** (the app already flips for `ar`), so adding Urdu to the RTL set is a configuration concern, not a rewrite.
- P5 and all in-flight work keep new screens **fully i18n-ready** (e.g. the new Customer 360 adds a `customer360` namespace with symmetric ar/en and zero hardcoded labels).

## Future review scope (when scheduled — design first, no code)
1. **Catalog structure for N locales** — keep the per-module split; decide locale = file (`*.ar.ts`) vs. locale = key (current `export const ar/en`). Evaluate ICU/plural needs for `hi`/`ur`/`fil`.
2. **Bundle loading** — per-locale dynamic import so a session ships only its active language (Req 7); measure first-load impact.
3. **Fallback language** — define the resolution chain (selected → company default → `en`) and how partial translations degrade.
4. **Missing-key detection** — extend the symmetry test to **all enabled locales** and add a CI gate / report for untranslated keys (fail or warn).
5. **Company-level enablement** — a `company.enabled_languages` model + per-user preference, gated like other entitlements (no RLS/permission change without separate approval).
6. **RTL set** — generalize the `dir` decision from "is `ar`" to "is in RTL set {`ar`, `ur`}".
7. **Translation workflow** — how new keys get translated (vendor/AI-assisted) and kept symmetric.

## Methodology (when scheduled)
- **Design / audit first** — structure, fallback, loading, detection, enablement model. **No implementation.**
- Then architecture review → before/after → reuse analysis → implementation plan before execution (same gated methodology as Settings M3 / Admin Center Alignment / P5).
- Constraints expected: reuse-first; no business-logic / permission / RLS / workflow change unless separately approved; **never regress symmetry or introduce hardcoded labels**.

## Sequencing
Per direction, **current priority remains P5 Customer Workbench**. This item is **parked** and begins with a design/audit pass; nothing is implemented until that design + plan are reviewed and approved.
