# VANTORA — Final Production Readiness Report

**Target production environment:** `vantora-staging` (Supabase `rsjvgehvastmawzwnqcs`, eu-west-1,
Postgres 17.6) — promoted to production for the first FMCG distributor pilot.
**`kako-fmcg`:** not touched, not referenced. **Date:** 2026-06-10. **Mode:** review-only (no mutation).

---

## 1. Executive summary

The environment is **technically ready** to become production. Schema, the refined FMCG role model, and
the full van-sales transaction loop are validated. Remaining work is **operational and sequenced**: enable
backups, wipe demo data, import the distributor's real data, invite real users, and publish a public
frontend. **No code or schema blockers remain.** The one hard gate before any data mutation is a **verified
PITR / backup restore point** (your action).

| Dimension | Verdict |
|---|---|
| Schema & data model | 🟢 Ready |
| FMCG transaction loop | 🟢 Ready |
| Role / permission model | 🟢 Ready |
| Security posture | 🟢 No blockers (0 ERROR advisors) |
| Backups / DR | 🔴 **Gate** — enable + verify PITR before cleanup |
| Real data & users | ⚪ Pending import + invites (operational) |
| Public frontend | 🟡 Preview exists; needs prod env vars + public URL |

## 2. What is proven

| Area | Evidence |
|---|---|
| **Schema completeness** | 270 `erp_*` tables, 189 functions; full 250-migration repo schema applied; integrity check passes |
| **FMCG RPCs** | `erp_van_sell` · `erp_van_return` · `erp_settle_collection` · `erp_compute_van_reconciliation` · `erp_resolve_price` · `erp_user_has_permission` all present |
| **Transaction loop** | sell → collect → return + credit-note → reconcile validated; reconciliation variance 0; numbers tenant-scoped (`0268`) |
| **Refined roles** | Merchandiser / Cash Van / Collection Officer / Credit Controller + Van Rep (cash+credit) seeded by default; **325/325** role assertions; cash-van credit invoice blocked by permission **and** DB guard |
| **Multi-tenant isolation** | RLS enforced; tenant-scoped document numbering proven with 2 tenants sharing a branch code |
| **Seed reproducibility** | `reference-company.sql` rebuilds the full demo tenant idempotently (also a cleanup fallback) |

## 3. Security & performance posture (live Supabase advisors)

**Security: 0 ERROR, 184 WARN.** None are go-live blockers:
- `authenticated_/anon_security_definer_function_executable` ×157 — **by design**: the app's RPC layer is
  `SECURITY DEFINER` with `auth.uid()`/permission checks inside. No action.
- `function_search_path_mutable` ×13 — hardening: add `SET search_path` to those functions (post-pilot).
- `rls_policy_always_true` ×11 — review (mostly global lookup tables intended to be world-readable).
- `extension_in_public` ×2, `auth_leaked_password_protection` ×1 — **enable leaked-password protection**
  (one toggle); extensions-in-public is cosmetic.

**Performance: 437 WARN / 349 INFO — dominated by empty-DB artifacts.**
- `unused_index` ×344 + `multiple_permissive_policies` ×430 are expected on an empty database; **re-run
  advisors after real-data load**, then act on what remains.
- Quick wins now: `duplicate_index` ×1, `unindexed_foreign_keys` ×4, `auth_rls_initplan` ×6 (wrap
  `auth.uid()` in a sub-select).

## 4. Environment facts

| Fact | Value |
|---|---|
| Project | `vantora-staging` / ref `rsjvgehvastmawzwnqcs` |
| Region · Postgres | eu-west-1 · 17.6 |
| Tenants today | **1** (demo *Nile FMCG*) — to be wiped |
| Identities today | **58**, all `@nile-group.test` — to be wiped |
| Real data | none yet |
| Roles | 25 (`erp_roles`) = 21 system + 4 refined |
| Global perms | 394 (`erp_role_permissions`) |

## 5. Go-live work breakdown (operational)

| Step | Owner | Artifact |
|---|---|---|
| 0. Enable + verify PITR | Platform admin | `GOLIVE-STEP1-CLEANUP-REVIEW.md` §1–2 |
| 1. Demo cleanup (data-only) | Platform admin | `supabase/pilot/golive-demo-cleanup.sql` (guarded, dry-run-safe) |
| 2. Master-data import | Data Admin + distributor | `docs/onboarding/templates/*.csv` + README |
| 3. User invites + refined roles | Platform admin | `07-users.csv`, User Onboarding Guide |
| 4. Public frontend | Platform admin | `GOLIVE-VANTORA-STAGING-AS-PROD.md` §4 |
| 5. Sign-off | All | `GO-LIVE-CHECKLIST.md` |

## 6. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cleanup removes more than intended | Low | Script **refuses** unless exactly 1 demo company + 0 real users; **dry-run by default**; runs in one transaction with post-delete verification |
| No restore point if cleanup goes wrong | Med (if skipped) | **Hard gate**: PITR verified first; plus seed-rebuild fallback |
| Invite emails don't deliver | Med | Configure SMTP + Auth Site URL **before** inviting |
| Frontend points at wrong project | Low | Set explicit Vercel prod env vars (don't rely on code fallback); smoke-test |
| Perf lints on real data | Low | Re-run advisors post-import; address remaining indexes/policies |

## 7. Sign-off gate

Production cutover proceeds **only after**: (a) PITR/backup restore point verified, (b) cleanup dry-run
reviewed, (c) this report + the Go-Live Checklist approved. Until then: **review-only, no mutation.**
