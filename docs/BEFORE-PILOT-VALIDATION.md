# Before-Pilot Validation Report

*Covers the 🔴 Before-Pilot set: Inventory pagination (done), baseline load test, security review, backup/restore validation, monitoring/alerting validation. Review-first — no merge, no production migrations.*

---

## 1. Inventory pagination — ✅ done
The last unbounded core list is converted to the standard framework: stock-levels are **server-paginated** (50/page, exact count), **warehouse filter + product search are URL-driven** (deep-linkable), with a `<Pager>`. Search resolves matching product ids first, then filters the paginated stock table (avoids an unbounded join/scan). Verified: tsc clean · 337 unit · 18 integration · build clean (`/inventory` 6.05 kB).

## 2. Baseline load test

### Methodology
- **DB-layer benchmark (executed here):** seeded **100,000 customers in one tenant** on a modest local Postgres 16 and timed the exact query shapes the standard list uses (`EXPLAIN ANALYZE`, warm runs). **Conservative: the 0110 composite indexes are NOT on this branch**, so these are worst-case-ish; the `(company_id, code)` unique index (from 0019) backs the default sort.
- **End-to-end harness (provided, run on staging):** `scripts/loadtest/` — `seed.sql` (N customers/products per tenant) + `k6-lists.js` (ramping 50 VUs over the list/search endpoints, p95<500ms / error<1% thresholds) + README. Run on a staging/branch DB to get full network+PostgREST+render numbers.

### Dataset size
- DB benchmark: 100k customers, single tenant (the per-tenant stress point).
- Recommended staging run: ~10 companies × ~25k customers + 12 months of transactions (≈ the DB Scalability Review's 250k-customer / millions-of-txn target).

### Concurrent users
- DB benchmark: single-connection timing (isolates query cost).
- Staging harness: ramp to **50 concurrent VUs** (≈ a busy pilot company's reps+desk); scale up to validate the 500-user platform target.

### Response times (measured, DB layer, 100k rows, no 0110)
| Pattern | Time | Notes |
|---|---|---|
| Page 1 — `order by code limit 25` | **0.45–1.75 ms** | index-backed (company_id, code) |
| Count `exact` | **~21 ms** | linear → ~200 ms at 1M |
| Deep page — `offset 99,975 limit 25` | **~37 ms** | offset degrades with depth |
| Search — `ilike '%…%'` + page | **~16 ms** | leading wildcard = scan within tenant |
| Planned count (`reltuples`) | **0.7 ms** | instant; for large tables |
| Unbounded fetch-all (old pattern) | ships 100k rows | the cost pagination removes (payload + per-row redaction) |

### Bottlenecks found
1. **`count: exact`** is the most scale-sensitive piece (linear). → switch to **`planned`** above ~100k rows (helper `recommendedCountMode` already exists).
2. **Deep offset pagination** degrades with page depth (rarely hit by users). → **keyset pagination** for very deep navigation (Can-Wait).
3. **Leading-wildcard `ilike` search** can't use the btree (scans within tenant; ~16ms at 100k). → **`pg_trgm` GIN** index (+ Arabic normalization) for sub-ms fuzzy search at scale (Should-Fix before large tenants).
4. **Apply the 0110 composite indexes** (separate PR) before pilot data load — they cover status+date / company+salesperson shapes the dashboards/reports use.

### Recommended limits
- **Page sizes:** 25 master / 25 transactional / 50 high-volume (as the Standard List doc).
- **Count mode:** `exact` ≤ ~100k rows per filtered set; `planned` beyond.
- **Per-tenant comfortable ceiling (current code + indexes):** **hundreds of thousands** of customers with sub-50ms list/search at the DB layer; the count + search are the first to need the mitigations above.
- **Action:** run the staging k6 harness to confirm end-to-end p95<500ms before onboarding a large tenant.

## 3. Security review (new stack: 0111–0117 + governance)

### Findings, severity, remediation
| # | Finding | Severity | Remediation |
|---|---|:--:|---|
| S1 | All new `SECURITY DEFINER` functions set `search_path = public, pg_temp` | ✅ Pass | — (no search-path injection vector) |
| S2 | RLS enabled + tenant policies on all 6 new tables (attachments, field_config/access/sections/templates/versions); writes restricted to company-admin / platform-owner | ✅ Pass | — |
| S3 | **Governance read-redaction is app-layer, not DB column-level.** RLS authorizes the *row*; "hidden" fields are nulled in the server loader. A direct PostgREST/API query by an authenticated user could still read a column the UI hides. | **Low** (pilot: single trusted app, anon key gated by RLS, no public API) | Treat "hidden" as UI/enforcement, not a DB read-permission boundary. Add **DB column privileges or a secured view** before exposing a public API / enterprise tenants (documented Can-Wait). |
| S4 | Global field-templates (`company_id NULL`, `is_global`) are readable by all tenants | **Low** | Write-restricted to **platform-owner** already; ensure global snapshots carry no tenant-specific ids/values (normalize on save). |
| S5 | `service_role` key confined to `src/lib/supabase/service.ts` (server-only); not imported by client components | ✅ Pass | keep; never import in client bundles |
| S6 | Bulk / import actions loop with **per-row** permission + lockout checks via the user's RLS-bound client | ✅ Pass | — |
| S7 | Attachments storage RLS scoped by `(foldername)[1] = company_id` for read/insert/delete (0111) | ✅ Pass | — |
| S8 | No impersonation tooling → support diagnosis needs DB access | Info (ops) | build read-only Impersonation (roadmap #12) with full audit before commercial-scale support |
| S9 | The new stack has not had a **formal security review / pentest** | **Medium (process)** | commission one **before the first paying customer** (not a pilot blocker) |

**Net:** no High/Critical issues in the new stack. The one caveat to internalize is **S3** — app-layer redaction is sufficient for the pilot but is not a DB-enforced read boundary; close it with DB column privileges before any public API or enterprise/regulated tenant.

## 4. Backup / restore validation
*Cannot be executed from here (no staging credentials); this is the required procedure + checklist.*
- [ ] Confirm **Supabase automated daily backups** are enabled on staging & production projects.
- [ ] Confirm **PITR** (point-in-time recovery) is enabled on the production plan; note retention window.
- [ ] **Restore drill:** restore the latest backup into a Supabase **branch/clone**, verify row counts on key tables, the migration history (`supabase_migrations`), and that the app boots against it.
- [ ] Record **RTO/RPO** (target: RPO ≤ 24h via daily + PITR to minutes; RTO documented).
- [ ] Document the restore runbook (who, steps, verification) in ops docs.

## 5. Monitoring / alerting validation
- ✅ **Error tracking wired:** app-level `error.tsx` calls `Sentry.captureException` (keeps the shell + retry); `loading.tsx` skeleton.
- [ ] **Sentry alerts:** error-rate + new-issue alerts to a channel; release tagging.
- [ ] **DB metrics:** Supabase dashboard alerts on CPU, connection saturation, and **slow-query log** review (catch the count/search/offset costs at scale).
- [ ] **Uptime check** on the app URL + health route.
- [ ] **Log-based alerts** for auth failures, RLS denials, and migration-apply failures in CI.
- [ ] Define **SLOs** (e.g., list p95 < 500ms, availability 99.5%) and dashboards.

## Summary — Before-Pilot status
| Item | Status |
|---|---|
| Inventory pagination | ✅ Done (code) |
| Load test | ✅ DB-layer benchmarked + staging harness provided; **run staging k6 + apply 0110 before large data load** |
| Security review | ✅ Done — no High/Critical; close S3 (DB column privileges) before public API; formal pentest before first paying customer |
| Backup/restore | ⏳ Procedure + checklist provided — **execute on staging** |
| Monitoring/alerting | ◐ Error tracking live — **complete the alerting/SLO checklist** |

**Remaining 🔴 before pilot launch:** execute the staging load test + backup drill + finish alerting, and **deploy the stack** (ordered merge incl. 0110, guarded prod window) — none are code-blocked; they are ops/deploy actions.

---

*Validation report only. No merge, no production migrations.*
