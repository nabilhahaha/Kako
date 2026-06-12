# VANTORA — Pharmacy Pilot Templates

**Phase:** real-user pilot · **Development:** FROZEN · **Goal:** validation, not expansion.
**Categories ONLY:** Bug · Permission · Mobile · Performance · Deployment.
**No feature requests during the pilot** unless a real business process is fully blocked (see Gap Report §2.4).

---

## Template 1 — Pilot Feedback

One row per finding. Repro + screen + role + device is enough to act on.

| Field | What to enter |
|---|---|
| ID | P-001, P-002, … |
| Date / time | when it happened |
| Tester / Role | name + role (owner / pharmacist / cashier) |
| Pack / Screen / Route | e.g. Pharmacy POS `/pharmacy/pos` |
| Device / Browser / OS | e.g. iPhone 13, Safari, iOS 18 |
| Category | Bug · Permission · Mobile · Performance · Deployment (one only) |
| Severity | Blocker · Major · Minor · Cosmetic |
| Frequency | Always · Sometimes · Once |
| What happened | observed behaviour |
| Expected | what should have happened |
| Repro steps | 1 - 2 - 3 |
| Screenshot / video | attach or reference |
| Status | New · Triaging · Fixing · Fixed · Won't-fix (reason) |

**Intake log**

| ID | Date | Role | Screen | Device | Category | Severity | Freq | Summary | Status |
|----|------|------|--------|--------|----------|----------|------|---------|--------|
| | | | | | | | | | |

---

## Template 2 — Gap Report (fill after the pilot)

**2.1 Summary by category**

| Category | Blocker | Major | Minor | Cosmetic | Total |
|---|---|---|---|---|---|
| Bug | | | | | |
| Permission | | | | | |
| Mobile | | | | | |
| Performance | | | | | |
| Deployment | | | | | |
| **TOTAL** | | | | | |

**2.2 Issues found & resolved**

| ID | Category | Severity | Fix summary | Commit |
|----|----------|----------|-------------|--------|
| | | | | |

**2.3 Confirmed working (pilot-validated end-to-end)** — list each flow a real user completed on the deployed app.

**2.4 Blocked business processes (the ONLY path to new work)** — only where a real pharmacy process could not be completed at all; each needs explicit approval before any build.

| # | Blocked process (user's words) | Pack / screen | Business impact | Proposed fix | Approval |
|---|---|---|---|---|---|
| | | | | | |

**2.5 Non-functional observations** — performance, mobile friction, training, data quality.

**2.6 Go / No-Go**

| Verdict | Conditions / blockers remaining |
|---|---|
| Go / Conditional Go / No-Go | |

---

## Template 3 — Bug Classification

**3.1 Category definitions (use exactly one)**

| Category | Means | Example |
|---|---|---|
| Bug | A feature does the wrong thing, shows wrong data, or errors | Checkout totals wrong; FEFO picks wrong batch |
| Permission | Wrong role can/can't reach or do something; server rejects a valid action | Cashier sees Valuation; admin blocked from a transfer |
| Mobile | Layout broken, target too small, keyboard/scroll/viewport issue on phone/tablet | Cart hidden behind keyboard; button off-screen |
| Performance | Slow screen/search/checkout, heavy query, jank | POS search >2s; report spins |
| Deployment | Env mismatch, build/deploy failure, stale UI, login/connectivity | "Load failed" on login; old version served |

**3.2 Severity matrix**

| Severity | Definition | Target response |
|---|---|---|
| Blocker | Core task cannot be completed; data loss/corruption; login down | Fix now; push same day |
| Major | Important flow broken but a workaround exists; wrong figures | Fix within the pilot; prioritised |
| Minor | Annoyance, edge case, small UI/role slip; no business impact | Batch-fix; schedule |
| Cosmetic | Visual/text only; no functional effect | Log; fix opportunistically |

**3.3 Triage decision rules**
- Blocker/Major in Bug, Permission, or Deployment → fix immediately, CI green + tests, push to PR #311, record the fix.
- Mobile / Performance → fix if low-risk; if it needs layout/query rework, confirm scope first.
- Ambiguous or architectural → do NOT guess; raise for a decision.
- Looks like a feature request → NOT built during the pilot; only if it maps to a fully-blocked business process (§2.4) and is approved.

**3.4 Every fix must preserve** — multi-tenant + RLS isolation · server-side role enforcement · feature-flag gating · audit trail · mobile usability · CI green.
