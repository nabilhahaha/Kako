# Pilot Go / No-Go Review

*Final decision synthesis across the DB Scalability, UX/Performance, DFG, Standard-List, Before-Pilot Validation, and Deployment Playbook reviews. Decision document — no code, no merge, no production migrations.*

---

## Recommendation: **GO for a controlled FMCG pilot — conditional.**
Proceed **once the 5 "Must Complete Before Pilot" items are executed** (all are **ops/deploy actions — no code blockers remain**). The product is feature-complete, staging-validated, secure (no High/Critical), and measured fast at pilot scale.

**Overall confidence: ~85% (High).** The build is done and green; the residual risk is **execution** (deploying a deep PR stack correctly) and **two unrun validations** (staging load test, backup drill) — both low-risk and fully covered by the playbook + measured benchmarks.

### Confidence by dimension
| Dimension | Confidence | Basis |
|---|--:|---|
| Functional completeness | **High (95%)** | core ERP + hierarchy + status + DFG + attachments + standard lists all built & green |
| Architecture & security | **High (90%)** | per-company RLS everywhere; no High/Critical; one Low caveat (S3 app-layer redaction) |
| Performance at pilot size | **High (90%)** | measured 0.45–1.75 ms page / ~16 ms search at 100k rows; pilot is far smaller |
| Scalability headroom | **Med-High (80%)** | designed for 250k/millions; count/search/scoped-RLS mitigations identified, not yet needed |
| Deployment readiness | **Medium (75%)** | playbook ready but **not executed**; ~14-deep stack + divergent 0110 to land |
| Ops / support readiness | **Medium (70%)** | Sentry live; **backup drill + alerting unfinished; no impersonation** |

---

## 🔴 Must Complete Before Pilot (gating — all ops/deploy; no code blockers)
1. **Deploy the stack** per the Deployment Playbook — merge the full lineage **including 0110** (recommend Strategy B integration branch), staging → guarded production, contiguous 0100–0117.
2. **Run the staging load test** (k6 harness) — confirm **p95 < 500 ms**, error < 1%, index scans (not seq).
3. **Backup + PITR confirmed + one restore drill** (RPO ≤ 5 min, RTO ≤ 2 h validated).
4. **Finish monitoring/alerting** — Sentry alerts, DB/slow-query alerts, uptime check, basic SLOs.
5. **Provision the pilot tenant** (company, branches, admin, roles) + load real master data via the existing per-entity import.

*Already complete (code):* Inventory pagination · S1 standard lists + S2 per-page redaction · UX Must-Fix (M1–M3) · DFG-1→3 · FP-0/FP-CS · attachments · security review.

## 🟠 Must Complete Before First Paying Customer
- **Performance/scale wiring:** count-mode cutover (`planned` >100k) · `pg_trgm` + Arabic search normalization · scoped-role RLS index path · dashboard active-only filters · retention/clean-up jobs (audit/notifications/workflow) · report summaries.
- **UX/product:** role-tailored dashboards (S3) · sortable headers + filtered export · `not-found.tsx` · mobile filter drawer · quick-create + ⌘K record jump.
- **Governance/robustness:** publish/rollback transactional RPC (R1).
- **Onboarding/data:** Master Data Import Center (validation/preview/rollback) · Onboarding Wizard v1.
- **Operations/commercial:** Notification Center · Impersonation (read-only, audited) · **Feature Flags** · **Subscription & Billing** (or manual-invoice fallback for the very first customer) · **formal security review/pentest** · runbooks + SLOs.

## 🟢 Can Wait Until Scale
- Table partitioning (10M+ rows) · read replica / analytics copy · cold-tenant archiving.
- Keyset (deep-page) pagination · row virtualization · saved views · favorites.
- Field-value inheritance + FP-0c (credit/consolidation) · DB column-level read privileges (vs app-layer redaction).
- Command Center KPIs · Universal Timeline · Data Quality Dashboard · Integration Health Dashboard · **AI Assistant**.

---

## Decision
**GO — conditional on the 5 Before-Pilot ops/deploy items.** No engineering work blocks the pilot; the gating set is deployment + two validations + tenant provisioning, all documented and low-risk. Once those are done, launch the controlled FMCG pilot and run the 🟠 list as the hardening sprint toward the first paying customer.

**Top residual risks to watch in-pilot:** (1) deploy correctness of the deep stack → mitigated by Strategy B + per-step staging-apply; (2) a single tenant loading a very large customer book before the count/search mitigations → mitigated by the 0110 indexes + the measured headroom; (3) support diagnosis without impersonation → mitigated by audit logs + white-glove pilot support.

*Decision document only. No merge, no production migrations.*
