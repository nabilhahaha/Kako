# Migration Renumber Plan + #310 Residual Review

## Part 1 — Duplicate migration number `0265` (RESOLVED)

### How migrations are applied (the safe-review finding)
`.github/workflows/migrate-staging.yml` (and the prod job) apply migrations with a
**stateless shell glob**:
```
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
```
- Order = **filename lexical order**. There is **no version table / no de-dup**.
- Envs are **reset-able**: "staging is expected to be reset-able … not guaranteed
  idempotent; reset before re-applying." Fresh deploys reset, then apply all files.

**Implication:** the duplicate *number* did not break the live DB (both files ran,
deterministically: `0265_entitlements…` < `0265_van_sell` < `0266…`). But it is
fragile — Supabase CLI (`db push`/`db diff`) and contributors key on the numeric
prefix, so two `0265`s invite future ambiguity. Resolving it is correct hygiene.

### Dependency analysis (why the rename direction is safe)
- `0265_van_sell.sql` is **referenced by later migrations** `0305_van_sell_uom`,
  `0306_van_sell_with_payment`, `0314_rpc_authz_enforcement`, `0317_rpc_guard_entrypoint`.
  → van_sell **must keep an early number** (stays at **0265**).
- `0265_entitlements_company_feature_writes.sql` (an RLS write-policy on
  `erp_company_entitlements`) has **no later-migration dependents** (only its prereq
  table from `0263_entitlements_foundation` precedes it). → safe to move to the end.

### Exact renumbering applied
```
git mv supabase/migrations/0265_entitlements_company_feature_writes.sql \
       supabase/migrations/0338_entitlements_company_feature_writes.sql
# in-file header note updated: "0338 (was 0265 — renumbered to resolve a duplicate)"
```
Result: **no duplicate migration numbers remain**; van_sell stays at 0265 ahead of its
dependents; entitlements policy applies last (0338), after its prereq table.

### Why this is safe for existing + fresh environments
- **Fresh deploys / new environments / new tenants:** apply all files in filename
  order — now unambiguous (unique numbers). The entitlements policy at 0338 still runs
  after `erp_company_entitlements` is created (0263). ✓
- **Live vantora-staging (already applied):** reset-able; the next reset+apply uses the
  corrected filenames. No live-DB mutation was required by this rename. ✓
- **No code/tooling references the old filename** (migrations are glob-applied, never
  imported), so nothing else changes.

> Applied on `main` (where the merge created the clash). The pilot branch never had the
> entitlements migration, so no duplicate exists there.

---

## Part 2 — #310 residual items review

`claude/form-builder-engine-h92fzd` retains 3 items not in `main`:

| Item | What it is | Already on main? | Recommendation | Rationale |
|---|---|---|---|---|
| `src/app/(app)/forms/customer-data-update/actions.ts` | Form-builder server actions for the Customer-Data-Update form (form-builder-engine line) | **No** — but main HAS `customer-data-update/page.tsx` + `runner.tsx` + integration test (the pilot-line implementation) | **Archive only** | Main already ships a working customer-data-update (page+runner+test, suite green). This `actions.ts` is the parallel form-builder approach, out of FMCG-pilot scope. Preserve as a tag for future form-builder work; do **not** merge (risk of colliding with main's working version) and do **not** discard. |
| `VANTORA-FMCG-Readiness-Assessment.docx` | Early readiness assessment (root-level) | No | **Archive only** | Historical; superseded by the current `docs/audits/*` certification set on main. Keep for provenance, not in main. |
| `VANTORA-Sell-Invoice-Collect-Design-Review.docx` | Early sell/invoice/collect design review | No | **Archive only** | Historical design doc; superseded by shipped pilot + current audits. Keep for provenance. |

**Net:** none require merging into main; none should be discarded. All three are
preserved when `form-builder-engine` is **archived by tag** (so the branch itself
becomes deletable without losing them).

> If you DO want the form-builder Customer-Data-Update flow in the product, that is a
> separate feature decision (merge `actions.ts` + reconcile with main's page/runner) —
> flagged, not assumed.

---

## Status & next steps
- **Migration duplicate: RESOLVED** on `main` (rename committed). Fresh deploys/new
  environments/new tenants now have unambiguous migration ordering.
- **#310 residual: REVIEWED** — all three → **Archive only**.
- **No branch deleted or archived.** With the prerequisite resolved and #310 reviewed,
  the cleanup can proceed on your go: archive-tag the unique-code branches (incl.
  `form-builder-engine`), delete the fully-merged branches, keep **`main`** +
  **`claude/fmcg-sell-collect-loop`** as the only active branches.
