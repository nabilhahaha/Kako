# Pharmacy Pilot — Feedback Intake & Gap Report

**Phase:** real-user pilot testing · **Development status:** FROZEN
(only Bug / Permission / Mobile / Performance / Deployment fixes — no new
functionality unless a pilot user surfaces a genuine business need).

Tenant: **Amty Pharmacy (DEMO)** · Deployed: branch `claude/fmcg-sell-collect-loop` / PR #311.

---

## 1. How to log a finding

For every issue a pilot user hits, capture one row in the intake table below.
Keep it short — repro + screen + role + device is enough to act on.

| Field | What to write |
|---|---|
| **ID** | P-001, P-002, … |
| **Date** | when it happened |
| **Reporter / Role** | e.g. cashier, pharmacist, owner |
| **Screen / Route** | e.g. Pharmacy POS `/pharmacy/pos` |
| **Device / Browser** | e.g. iPhone Safari, Android Chrome, desktop |
| **Category** | Bug · Permission · Mobile · Performance · Deployment |
| **Severity** | Blocker · Major · Minor · Cosmetic |
| **What happened** | observed behaviour |
| **Expected** | what should happen |
| **Repro steps** | 1-2-3 |
| **Status** | New · Triaging · Fixing · Fixed · Won't-fix (with reason) |

### In-scope categories (allowed fixes during the freeze)
- **Bug** — a feature does the wrong thing or errors.
- **Permission** — wrong role can/can't reach or do something; server rejects a valid action.
- **Mobile** — layout broken, target too small, keyboard/scroll issue on phone/tablet.
- **Performance** — slow screen, slow search/checkout, heavy query.
- **Deployment** — env mismatch, build/deploy failure, stale UI, login/connectivity.

### Out of scope (park for the gap report, do NOT build during the freeze)
- New screens, new fields, new workflows, new reports — **unless** a pilot user
  proves a real business need; then it goes to the Gap Report for explicit approval.

---

## 2. Intake log

| ID | Date | Role | Screen | Device | Category | Severity | What happened | Status |
|----|------|------|--------|--------|----------|----------|---------------|--------|
| _(none yet)_ | | | | | | | | |

---

## 3. Triage rules (how I act on each)

1. **Blocker / Major bug, permission, deployment** → fix immediately, push to PR #311,
   note the fix here. (CI green + tests required before push.)
2. **Mobile / Performance** → fix if low-risk; if it needs a layout/query rework,
   log it and confirm scope before touching.
3. **Ambiguous or architectural** → do NOT guess; raise it for a decision.
4. **Feature request** → record in the Gap Report (§4), never build silently.

Every fix keeps the existing guarantees: multi-tenant + RLS safe, role-enforced
server-side, feature-flag gated, audited, mobile-usable, CI green.

---

## 4. Gap Report (fill after the pilot)

### 4a. Issues found & resolved
| ID | Category | Severity | Fix summary | Commit |
|----|----------|----------|-------------|--------|

### 4b. Confirmed working (pilot-validated)
- Screens/flows a real user completed end-to-end on the deployed app.

### 4c. Business gaps surfaced by users (candidate new work — needs approval)
| # | Need (in the user's words) | Pack / screen | Impact | Recommendation |
|---|---|---|---|---|

### 4d. Non-functional observations
- Performance numbers, mobile friction, training notes, data-quality notes.

### 4e. Go / No-go recommendation
- Verdict for moving from pilot → production, with any conditions.

---

## 5. Quick reference — pilot accounts & entry

- URL: `https://kako-git-claude-fmcg-sell-collect-loop-123456789-s-projects.vercel.app`
- Accounts (password `amty2026`): `owner@amty.test` (admin) · `pharmacist@amty.test` ·
  `cashier1@amty.test` · `cashier2@amty.test` — all default to **Amty Pharmacy (DEMO)**.
