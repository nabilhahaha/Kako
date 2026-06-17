# First Real Customer Deployment Plan

**Objective:** onboard the **first real FMCG distributor** onto VANTORA and
**capture structured real-world feedback** — not to add features and not to
scale. Success is measured in *learning and reliable daily operation*, not in
breadth.

> **Guiding principle:** one distributor, one branch, 1–3 van reps, online-first,
> behind `KAKO_VAN_SALES` (default OFF) + a per-company toggle. Go deep, observe
> everything, change nothing on the platform during the pilot unless a blocker
> forces it.

This plan sequences the **certified pilot package** and the
[Onboarding Package](./ONBOARDING-INDEX.md) into a dated, owned, measurable
deployment with an explicit feedback engine and a decision gate.

---

## 1. Scope & non-goals

**In scope:** deploy to production for one distributor; run the full
sell→collect→return→reconcile→close loop daily; capture feedback; decide
scale/iterate/pause.

**Explicit non-goals (during the pilot):**
- ❌ No new features / no schema changes (feedback is *captured*, not *built*).
- ❌ No multi-distributor rollout.
- ❌ No offline mode (Phase 6 is out of scope; route must have connectivity).

## 2. Select the first distributor

Pick for *learnability and low risk*, not size. Ideal profile:

| Criterion | Target |
|---|---|
| Size | 1 branch, **1–3 van reps**, ~100–500 active customers |
| Route connectivity | Reliable mobile data (online-first) |
| Data quality | Clean, exportable master data (products, customers, prices) |
| Sponsorship | An engaged owner/GM + a hands-on supervisor |
| Appetite | Willing to run **in-app, no off-book**, and give candid feedback |
| Products | Single base UoM per SKU (multi-UoM deferred) |

Red flags → choose a different first customer: poor connectivity + offline
mandatory; messy/unavailable master data; no internal champion.

## 3. Roles & responsibilities (RACI)

| Activity | Distributor Owner/GM | Supervisor | Reps | VANTORA Deployment Lead | VANTORA Support |
|---|---|---|---|---|---|
| Sign-off & scope | **A** | C | I | R | I |
| Master data supply | **R** | C | I | A | I |
| Environment + activation | I | I | I | **R/A** | C |
| User onboarding & training | C | **R** | I | A | C |
| Go/No-Go decision | **A** | C | I | R | C |
| Daily operation | I | **A** | **R** | I | C |
| Reconciliation | I | **R/A** | I | I | C |
| Feedback capture | C | **R** | R | **A** | R |
| Issue triage/escalation | I | R | I | A | **R** |
| Scale/iterate decision | **A** | C | I | R | C |

R=Responsible · A=Accountable · C=Consulted · I=Informed.

## 4. Timeline (indicative, ~4 weeks)

| Phase | Duration | Outcome |
|---|---|---|
| **0. Qualify & agree** | 2–3 days | Customer selected, scope + success criteria signed, sponsor named |
| **1. Build** (onboarding package) | 2–4 days | Master data imported, users + vans + pricing set, Readiness = READY |
| **2. Rehearse** | 1 day | Supervised on-device dry-run passes; training delivered |
| **3. Go-live + Hypercare** | 5 working days | Daily in-app operation; intensive support; daily feedback synthesis |
| **4. Stabilize** | 2 weeks | Tapering support; weekly metrics; feedback backlog triaged |
| **5. Evaluate & decide** | 2–3 days | Pilot report; scale / iterate / pause decision |

## 5. Prerequisites & environment

- [ ] **Production project** provisioned; backups/observability on.
- [ ] **Company** created (name, currency, country, **tax number**, **logo**).
- [ ] `KAKO_VAN_SALES=1`; per-company `is_enabled` initially **OFF** until rehearsal passes.
- [ ] **Staging** carries the **reference tenant** for side-by-side comparison.
- [ ] **Branch codes** chosen (tenant-scoped numbering since 0268 — safe to reuse common codes).
- [ ] Data export from the distributor's current system mapped to the
      [import templates](./templates/README.md) (ERPNext/Odoo presets available).

## 6. Deployment runbook

Execute the [Distributor Onboarding Checklist](./DISTRIBUTOR-ONBOARDING-CHECKLIST.md)
end to end (it is the runbook). Summary:

1. **Build** — import branches → warehouses/vans → products → suppliers → routes
   → customers → users → opening stock → journey plans.
2. **Configure** — VAT + base price per SKU; assign vans to reps; approve
   customers; set credit limits + payment terms; set discount cap.
3. **Activate** — per-company toggle ON; **Readiness Diagnostic = READY (0 blockers)**.
4. **Rehearse** — one supervised on-device dry-run (open→sell→collect→return→
   reconcile→close), all green; deliver Day-1 training.
5. **Go-live** — reps run their real day in-app; hypercare begins (§8).

## 7. Go / No-Go gate (sign-off required)

GO only when **all** are TRUE (from the certified package):
- [ ] `KAKO_VAN_SALES` ON + per-company `is_enabled = true`.
- [ ] Each rep has an assigned, stocked van; one base UoM per SKU.
- [ ] Every SKU resolves a positive price; customers approved/on-branch with
      credit limits; return reasons active.
- [ ] Roles assigned; reconciliation owned by supervisor/warehouse-keeper.
- [ ] **Readiness = READY**; **one on-device dry-run passed**.
- [ ] Route connectivity adequate; rollback understood (one switch).
- [ ] **Feedback channels live** (§9) and owners named.

Accountable sign-off: Distributor Owner/GM **+** VANTORA Deployment Lead.

## 8. Hypercare (go-live week)

- **On-call support** during field hours; deployment lead reachable.
- **Daily standup** (≤15 min): yesterday's sales/collections/returns posted
  in-app? all days closed + reconciled? any rejections (credit/stock/price)? any
  off-book activity? any new feedback items?
- **Daily feedback synthesis** (§9) → triage → log → (only if a *blocker*) escalate.
- Cadence + triage table: [Pilot Support Playbook](./PILOT-SUPPORT-PLAYBOOK.md).

## 9. Feedback capture plan (the core objective)

Capturing real-world feedback is the **primary deliverable** of this deployment.

### 9.1 Channels
| Channel | Who | Frequency |
|---|---|---|
| **Field feedback log** (`templates/feedback-log.csv`) | Supervisor + deployment lead | Continuous (every item) |
| **Daily standup notes** | Deployment lead | Daily (hypercare) |
| **Rep quick-pulse** (3 questions: what blocked you? what was slow? what helped?) | Reps | End of each day (week 1) |
| **Weekly review with sponsor** | Owner/GM + lead | Weekly |
| **In-app signals** | Support | Continuous (audit log, rejection tokens, reconciliation variances, day-close coverage) |

### 9.2 What to capture (taxonomy)
Each item logged with: date, source (rep/supervisor/owner/support), **category**,
**severity**, area, description, document/error token, status, resolution/owner.

- **Categories:** `bug` · `usability` · `data` · `process` · `performance` ·
  `training` · `feature-request` · `pricing` · `connectivity`.
- **Severity:** `S1 blocker` (can't operate) · `S2 major` (workaround exists) ·
  `S3 minor` · `S4 cosmetic/idea`.

### 9.3 Handling rules (no platform changes mid-pilot)
- **S1 blocker** → escalate immediately (T3); if no in-app workaround, consider
  per-rep or full **rollback** (one switch) while triaging. *Only* an S1 justifies
  a mid-pilot change.
- **S2–S4** → **log only**, do not build. These feed the post-pilot backlog and
  the next strategic phase.
- Every item gets a status: `open → triaged → resolved/deferred`.

### 9.4 Instrumented signals (objective, not just opinions)
Pull weekly from the system: in-app sales %, collection rate, return reasons
completeness, **reconciliation variance**, day-close coverage %, rejection
frequency by token (`over_credit`, `insufficient_van_stock`, price-0), cancelled/
corrected docs, GPS out-of-route exceptions. (See
[Week-1 Monitoring](../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md#5-pilot-week-1-monitoring-guide).)

## 10. Success metrics & exit criteria

| Metric | Target |
|---|---|
| In-app sales (no off-book) | ≥ 95% of route sales |
| Day-close + reconciliation | 100% for **5 consecutive days** |
| Stock accuracy (reconciliation variance) | ≥ 99% |
| AR / balance accuracy | 100% consistent |
| Returns via system with a reason | 100% |
| Cross-tenant / data-integrity incidents | 0 |
| Rep adoption | all reps operating independently |
| Feedback | logged, categorized, synthesized into a backlog |

**Pilot is "successful" when:** the exit criteria hold **and** the feedback
backlog is captured and prioritized — regardless of how many feature requests it
contains (those are the *point*, not a failure).

## 11. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dirty/incomplete master data | Med | High | Validate via import dry-run; compare to reference tenant; fix before go-live |
| Reps revert to paper | Med | High | Supervisor enforces in-app; daily standup catches off-book; show value (instant docs) |
| Connectivity gaps on route | Low–Med | Med | Confirm coverage in qualification; online-first; defer offline (Phase 6) |
| Pricing mis-set → price 0 / wrong price | Low | High | Readiness Diagnostic blocks; verify 2–3 SKUs; server-authoritative pricing |
| Over-credit/stock rejections frustrate reps | Med | Low | Train on the meaning; collect-first workflow; tune limits |
| Branch-code overlap with other tenants | — | — | **Resolved** (tenant-scoped numbering, 0268) |
| Scope creep (requests → build mid-pilot) | Med | Med | Strict §9.3: log S2–S4, build nothing; decide post-pilot |

## 12. Rollback & contingency

Instant, non-destructive — one switch:
1. Pause the module: unset `KAKO_VAN_SALES` **or** per-company `is_enabled=false`.
2. Per-rep pause: unassign the rep's van.
3. Re-enable anytime; issued documents remain valid.

Full guide: [Rollback](../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md#7-pilot-rollback-guide).
Trigger rollback only for an unresolved **S1 blocker**.

## 13. Communication plan

| Audience | Cadence | Owner | Content |
|---|---|---|---|
| Distributor sponsor (Owner/GM) | Weekly | Deployment lead | Metrics, feedback themes, decisions |
| Field team (reps/supervisor) | Daily (hypercare) | Supervisor | Standup, fixes, encouragement |
| VANTORA internal | Weekly | Deployment lead | Status, risks, backlog growth |
| Decision forum | End of pilot | Owner/GM + lead | Pilot report + scale/iterate/pause |

## 14. Decision gate — scale / iterate / pause

At pilot end, the deployment lead presents a **Pilot Report** (metrics vs §10 +
the categorized feedback backlog). The sponsor + lead decide:

- **SCALE** — exit criteria met, no S1 open → roll out to more reps/branches,
  then more distributors; feed the backlog into the next strategic phase.
- **ITERATE** — mostly met with specific gaps → address top backlog items
  (post-pilot, as planned development), then re-pilot the affected area.
- **PAUSE** — exit criteria not met / sustained S1 → rollback, root-cause, replan.

## 15. Post-pilot synthesis (the lasting output)

Produce, from the captured feedback:
1. **Pilot Report** — metrics, what worked, what didn't, incidents.
2. **Prioritized backlog** — S2–S4 items ranked (effort × impact), tagged to a
   future phase (e.g. Merchandiser/CS roles, brand/tax masters, offline Phase 6,
   multi-UoM).
3. **Onboarding refinements** — fold real lessons back into the
   [onboarding package](./ONBOARDING-INDEX.md) (templates, guides, timings).
4. **Go/No-Go for scale.**

> The first deployment's job is to convert *assumptions* into *evidence*. Ship
> nothing new during it; capture everything; decide with data.
