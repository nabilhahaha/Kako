# Operational Readiness — Execution & Results

*Proving operational readiness for the pilot. Items executed here are marked **✅ EXECUTED**; staging-Supabase-specific steps are proven mechanically + scripted for the team to run (**▶ RUN ON STAGING**). No production deployment, no merge to main.*

---

## 1. Final deployment / merge execution plan — ✅ EXECUTED (integration branch built & CI-provable)
Built the **`release/pilot`** integration branch (Strategy B from the playbook):
- Branched from the cumulative `claude/ux-hardening-pilot` tip and **cherry-picked `0110_composite_indexes.sql`** from `#76` → migrations now **contiguous 0100–0117 (incl. 0110)**.
- **Full chain applies clean on a fresh DB** (`setup-test-db.sh`, rc=0, no errors) — 0100→0117 in numeric order; 0110 composite indexes created (`idx_cust_company_salesman`, invoice composites, …).
- **Suites green on the integration branch:** 337 unit + 18 integration.
- Opened as a **DRAFT PR → `main`** so CI runs the **full staging migration-apply of the whole chain** + typecheck/build + integration + Playwright. **Do not merge until reviewed.**

**Execution order (recap):** verify contiguity → CI green (incl. staging-apply) → tag → guarded production apply in one window. (Strategy A bottom-up per-PR remains documented as the alternative.)

## 2. Staging load test — ✅ DB-layer EXECUTED (with 0110) · ▶ end-to-end RUN ON STAGING
**Measured on the full schema incl. 0110, 100k customers, one tenant:**
| Pattern | Time |
|---|---|
| Page 1 (order by code, limit 25) | **0.45–1.75 ms** |
| **Scoped rep list** (company + salesman, limit 25) | **0.36–1.1 ms** (index scan, 5 buffer hits) |
| Count `exact` | ~21 ms (→ use `planned` >100k) |
| Search `ilike '%…%'` + page | ~16 ms (→ pg_trgm later) |
| Deep page (offset 99,975) | ~37 ms (→ keyset later) |
| `planned` count | 0.7 ms |

**Result:** list & scoped queries are **sub-2 ms at 100k** with the indexes — comfortably within pilot scale. The three known costs (exact-count, leading-wildcard search, deep-offset) have documented mitigations and are not pilot blockers.
**▶ Still to run on staging:** the end-to-end **k6** harness (`scripts/loadtest/`) at 50 VUs to capture network+PostgREST+render p95 (<500 ms target) — DB layer is proven; this confirms the full path.

## 3. Backup / restore drill — ✅ EXECUTED (mechanical proof) · ▶ VALIDATE on Supabase
Local drill on the 100k-row DB:
- **Backup:** `pg_dump -Fc` → 4.4 MB in **0.64 s**.
- **Restore:** into a fresh DB in **4.9 s**, rc=0, 0 errors.
- **Verify:** restored **`erp_customers` = 100,000** (matches source); **125 `erp_*` tables** restored; schema intact.
- **Proves the runbook works mechanically.** On Supabase, the equivalent is **PITR / branch-restore** with the same verification queries.
**▶ On staging/production:** confirm automated daily backups + **PITR enabled**; run one PITR restore-to-clone drill; record the window. (RTO ≤ 2 h / RPO ≤ 5 min targets.)

## 4. Monitoring & alerting — ✅ instrumentation VERIFIED · ▶ CONFIGURE alerts
- **Verified in code:** `@sentry/nextjs` wired — `app/(app)/error.tsx` (`Sentry.captureException`, retry, keeps shell) + `app/global-error.tsx` + `sentry.server.config.ts` + `sentry.edge.config.ts` + `next.config.mjs`; `loading.tsx` skeleton; `friendlyDbError` surfaces server-action errors as toasts.
- **▶ Configure (ops):** Sentry error-rate + new-issue alerts to a channel + release tagging; Supabase alerts on DB CPU / connections / **slow-query log**; uptime check on the app + a health route; log alerts for auth failures / RLS denials / CI migration failures; define SLOs (list p95 < 500 ms, availability 99.5%) + a dashboard.

## 5. Pilot tenant preparation checklist
**Provisioning (one-time, per pilot company):**
- [ ] Create the **company** (name, `business_type` = wholesale/delivery, currency, VAT/CR).
- [ ] Create **branch(es)** (HQ + any depots).
- [ ] Invite the **company admin** + initial users; assign **roles** (admin, manager, salesman, accountant, …) on their branches.
- [ ] Confirm **roles → permissions** (defaults seeded; adjust per company if needed).
- [ ] Seed **customer master data** (segments/classifications/channels/business types) — auto-seeded for wholesale/delivery; verify/extend in Settings → Customer Data.
- [ ] Import **Customers** and **Products** via the existing per-entity CSV import; spot-check counts + required fields (DFG).
- [ ] Set up **routes** + assign salesmen/visit days (distribution).
- [ ] Activate/verify **approval workflows** (customer onboarding / credit-limit — pre-seeded); set `customers_require_approval` per policy.
- [ ] Configure **credit model** + per-customer credit limits / payment terms; set any **field-governance** rules the company wants.
- [ ] Smoke the **core flow** as the pilot admin: customer → order → invoice → issue → payment → statement; approvals inbox; attachments upload.

**Data strategy:**
- **Real data:** use the per-entity importer (Customers, Products) — manual-first, validated.
- **Demo/training:** `supabase/demo/fmcg_demo_seed.sql` (idempotent, single demo tenant) for a showcase tenant; `supabase/demo/demo_tenant_cleanup.sql` to remove it. **Never run demo seeds on the real pilot tenant or production.**

**Go-live gates (from the Go/No-Go):** deploy done · staging load test passed · backup drill done · alerting configured · this checklist complete.

---

## Operational readiness summary
| Item | Status |
|---|---|
| 1. Merge/deploy plan | ✅ Integration branch built; full chain applies; draft PR for CI-validated review |
| 2. Load test | ✅ DB-layer proven (sub-2ms @100k w/ 0110); ▶ run staging k6 |
| 3. Backup/restore | ✅ Mechanical drill passed (100k restored, verified); ▶ validate Supabase PITR |
| 4. Monitoring | ✅ Instrumentation verified; ▶ configure alerts/SLOs |
| 5. Pilot tenant prep | ✅ Checklist + data strategy ready |

**Net:** everything code/data-provable is proven green; the residual gates are **Supabase-account ops** (k6 on staging, PITR config, alert setup) + the **guarded production deploy** — all scripted/checklisted, none code-blocked.

*Execution & results only. No merge, no production deployment, no production migrations.*
