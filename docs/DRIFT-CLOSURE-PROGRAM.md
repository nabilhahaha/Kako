# VANTORA — Drift Closure Program (approval-ready)

> **Planning only — no production change, no migration executed.** Prepared
> `2026-06-04`. Verified read-only against production (`kako-fmcg`). Supersedes
> the earlier drift drafts as the single approval package. Builds on the verified
> facts; nothing here runs until approved.

---

## 1. Full migration inventory

Repo ships `0001–0143` (140 files; numbering gaps at `0120/0126/0127`).
**Applied in production:** everything through `0098`, **plus `0101`, `0102`,
`0118`** (the last applied during the invoicing hotfix). **Unapplied = 39
migrations:**

```
0099 0100
0103 0104 0105 0106 0107 0108 0109 0110 0111 0112 0113 0114 0115 0116 0117
0119 0121 0122 0123 0124 0125
0128 0129 0130 0131 0132 0133 0134 0135 0136 0137 0138 0139 0140 0141 0142 0143
```
(Excludes already-applied `0101`/`0102`/`0118`.)

| Group | Files | Theme |
| --- | --- | --- |
| G1 | `0099`,`0100` | Company trial + subscription canonicalization |
| G2 | `0103`,`0104`,`0105` | Customer model expansion + hierarchy/txn **scope RLS** |
| G3 | `0106` | Pricing engine |
| G4 | `0107`,`0108`,`0109` | Pilot hardening (perms + import) + customer approval (`erp_user_has_permission`) |
| G5 | `0110`–`0113` | Composite indexes, attachments, customer hierarchy, **status blocking** |
| G6 | `0114`–`0117` | Field governance (config / sections / templates / versions) |
| G7 | `0119`,`0121`–`0123` | Retention, per-assignment scope, role limits/routing, section binding |
| G8 | `0124`,`0125` | P6 finer capabilities + admin manage role-perms |
| G9 | `0128`–`0136` | **FMCG ops spine** (master ext, journey, transfers, GPS, day-close, van transfers, perms, copilot log, settings) |
| G10 | `0137`–`0143` | **Wave 1 value** (UOM/pricing, van recon, targets, return reasons, credit, perms, search) |

## 2. Production vs drift schema comparison (verified read-only `2026-06-04`)

| Sentinel object | Migration | In production? |
| --- | --- | --- |
| `erp_invoices.idempotency_key` | 0118 | ✅ yes (hotfix) |
| `erp_companies.trial_ends_at` | 0099 | ❌ |
| `erp_customers.approval_status` + `erp_user_has_permission()` | 0109 | ❌ |
| `erp_field_config` | 0114 | ❌ |
| `erp_journey_plans` | 0129 | ❌ |
| `erp_visit_compliance` | 0131 | ❌ |
| `erp_van_transfers` | 0133 | ❌ |
| `erp_fmcg_settings` | 0136 | ❌ |
| `erp_product_uoms` | 0137 | ❌ |
| `erp_targets` | 0139 | ❌ |
| `erp_return_reasons` | 0140 | ❌ |

→ Confirms the 39-file gap. **Tooling hazard (unchanged):** `schema_migrations`
uses full-timestamp versions while repo files use `00XX_` prefixes, so
`supabase db push` / the `migrate-production` workflow can mis-compare and
**replay** already-applied, non-idempotent migrations (e.g. `0101`'s bare
`CREATE POLICY`). **Apply only the explicit 39 files, never a blind replay.**

## 3. Business impact per group (what closing the drift turns ON)

Several shipped, deployed features are **dark in production today** because they
read these tables defensively (degrade to empty). Closing the drift **lights them
up with real data** — no further app deploy needed.

| Group | Unlocks in production |
| --- | --- |
| G1 | Accurate trial/subscription canonical state (billing edge-cases) |
| G2 | Customer hierarchy + **rep/team data scoping** (Territory Health, scoped visibility) |
| G3 | Pricing engine resolution |
| G4 | Customer **approval workflow** + `erp_user_has_permission` (governance) |
| G5 | Attachments; **customer status blocking** (block sales to inactive/suspended) |
| G6 | **Dynamic Field Governance** (per-company custom fields/sections) |
| G7 | Finer scope/limits/approval routing |
| G8 | Granular capability grants + company-admin role-perm management |
| **G9** | **Route Execution `/field/route`, Today journey cards, Visit Coaching GPS, day-close, Van transfers, Coverage/route-health** (journey/visit/settings data) |
| **G10** | **Price Book, Units of Measure, Targets & Achievement, Returns Analysis (reasons), Van Reconciliation, Sales Summary, Insights** (Wave-1 data) |

**Headline:** G9 + G10 activate the entire field-sales / van-ops / route-execution
/ insights surface we built (#105/#106/#108/#109/#110) — the highest business
value of the whole program.

## 4. Risk classification

| Group | Risk | Why |
| --- | --- | --- |
| G1 | **LOW** | additive columns/canonicalization |
| G2 | **HIGH** | `0104/0105` RLS scope = visibility cutover (what scoped users see changes instantly) |
| G3 | MEDIUM | pricing functions |
| G4 | MEDIUM | permission grants; `0109` verified zero-impact backfill (0 of 52 customers) |
| G5 | **MED-HIGH** | `0113` adds a sales-blocking trigger on customer status |
| G6 | MEDIUM | field-governance tables + RLS |
| G7 | MEDIUM | scope/limit/routing changes |
| G8 | MEDIUM | permission surface |
| G9 | **MED-HIGH** | largest block (9 files: tables, functions, RLS, triggers) |
| G10 | MEDIUM | additive value tables; already validated end-to-end on the disposable branch (Wave 1) |
| **Tooling** | **HIGH** | `db push`/`migrate-production` blind replay — **NO-GO** |

**Hard prerequisites:** PITR enabled · staging available with a prod-equivalent
restore · `schema_migrations` convention decided · maintenance window for the
RLS cutover (G2/G5/G9).

## 5. Staging execution plan

1. **Restore** the latest production physical backup (or a PITR copy) into a
   staging Supabase project → staging mirrors the applied-through-`0118` state.
2. **Apply the 39 files in numeric order, in groups G1→G10**, pausing after each
   group for the §6 checks. Exclude `0101`/`0102`/`0118` (already applied).
   Apply **explicitly** (`psql -v ON_ERROR_STOP=1 -f <file>` or recorded
   `apply_migration`) — **not** `db push`/`migrate-production`.
3. After each group: run `npm run test:db` + targeted checks (below).
4. Deploy the current `main` build to the staging Vercel env pointed at the
   restored DB; click through the now-live features (route-exec, van-ops, price
   book, targets, returns, insights).
5. Confirm `supabase db push` (or chosen tracker) reports **zero pending**.
6. Record outcome; only then schedule production.

## 6. Validation checklist (per group + overall)

**Per-group checkpoints**
- [ ] G1: `erp_companies.trial_ends_at` exists; subscription view sane.
- [ ] G2: a scoped rep sees only their customers/territory (no over/under-exposure).
- [ ] G4: `erp_user_has_permission` resolves; `approval_status` defaults `approved` (no customer made non-sellable unexpectedly).
- [ ] G5: a suspended customer is correctly blocked from new orders; active ones unaffected.
- [ ] G6: field-config screens load; no RLS errors.
- [ ] G9: `erp_journey_plans`/`erp_visit_compliance`/`erp_fmcg_settings` present → `/field/route`, `/today` cards, Coaching, day-close populate.
- [ ] G10: `erp_product_uoms`/`erp_targets`/`erp_return_reasons` present → Price Book, Targets, Returns Analysis, Van Reconciliation, Sales Summary, Insights populate.

**Overall**
- [ ] Zero pending migrations on the tracker.
- [ ] `get_advisors` security + performance: no new ERROR.
- [ ] Row counts intact (no data loss); invoicing still works.
- [ ] Tenant-isolation smoke (scoped user vs admin).
- [ ] App boots; key screens render with real data; no 500s.

## 7. Rollback plan

| Scenario | Mechanism |
| --- | --- |
| Mid-apply error | Stop (fail-fast); **PITR restore** to the pre-window timestamp (preferred for multi-object changes). |
| Post-apply regression | PITR restore; or targeted reverse for an isolated additive group. |
| App-only issue | Vercel: redeploy the previous READY production deployment. |

- **PITR is the primary rollback** for this program (multi-object) — it **must be
  enabled first** (see `PITR-ENABLEMENT.md`). The physical backup is the
  catastrophic fallback (loses post-snapshot writes).
- Hand-reversing 39 migrations is **not** an approved path — use PITR.
- After any rollback: re-run §6 overall checks; record incident notes.

## 8. Production cutover plan

1. **Pre-flight (hard gates):** PITR **ON** (timestamp recorded) · fresh backup ·
   staging dry-run green · `schema_migrations` convention chosen · maintenance
   window agreed · stakeholders notified.
2. **Apply** the 39 files **explicitly, in order (G1→G10), fail-fast**; record
   each in `schema_migrations` per the convention.
3. **Reload** the PostgREST schema cache (`NOTIFY pgrst, 'reload schema'`).
4. **Validate** (§6 overall) — zero pending, advisors clean, invoicing works,
   RLS smoke, features populate.
5. **Monitor** 24–48h: error rate, failed RPCs, advisors, invoice/payment success.
6. **Document** completion (date/operator/PITR timestamp) and update the ops log.

**NO-GO (unchanged):** `supabase db push` / `migrate-production` blind replay;
applying without a green staging dry-run; applying without PITR.

## 9. Required business decisions (before execution)
1. **Enable PITR** (may need a plan upgrade — cost). Gates the whole program.
2. **Staging tier** (standalone project vs preview branch).
3. **`schema_migrations` tracking convention** (numeric vs timestamp).
4. **Maintenance window** for the RLS/status cutover (G2/G5/G9).

*Approval-ready. No production change, no migration executed. On approval +
PITR/staging readiness, this program is executed group-by-group with checkpoints.*
