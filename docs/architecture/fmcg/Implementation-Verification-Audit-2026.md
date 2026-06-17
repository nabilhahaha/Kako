# Implementation Verification Audit — FMCG Field Suite (Pre-Pilot)

**Purpose:** verify that **actual application behavior matches the documented role
matrix** (`Pilot-Validation-Runbook-2026.md`) — not documentation validation. Every
finding below is derived from the **enforced code paths** that determine runtime
behavior, with `file:line` evidence. No assumptions.

**What "verified against the running application" means here.** In this stack the
real access-control decision is made in three enforced layers, all of which were
read directly:
1. **Page guard** (RSC `redirect`/`notFound`) — controls direct-URL page access.
2. **Server-action gate** (`requireActionPermission`) — controls mutations/loaders.
3. **RPC guard** (`erp_guard_rpc` + `REVOKE EXECUTE`) — controls direct DB/API calls.
The nav resolver (`visibleSections` / `resolveBottomNavTabs`) controls *visibility
only*. Auth-gated 8-role click-through against staging Supabase was **not** run in
this environment (no seeded authenticated sessions); items that can only be confirmed
live are marked **⧖ runtime-confirm** and folded into the pilot scripts (§3 of the
runbook).

---

## A. Verdict & severity summary

The role matrix is **substantially accurate at the page and nav layers** — every FMCG
page enforces a permission guard, the nav resolver matches the documented per-role
surfaces, and the Override path is fully hardened. Verification surfaced **3 real
enforcement gaps** that the documented matrix does **not** hold for:

| Sev | ID | Gap | Layer |
|---|---|---|---|
| **High** | V1 | `erp_day_close_try_close` is `SECURITY DEFINER` with **no permission guard and no `REVOKE EXECUTE`** → directly callable day-close bypass | RPC |
| **Medium** | V2 | `erp_van_return` / `erp_decide_van_return` lack `erp_guard_rpc`; revoked `FROM anon` only (not `public`) → an authenticated branch user can post/approve returns directly, bypassing `field.sales` / `returns.approve` | RPC |
| **Medium** | V3 | `loadDayCloseReview` + `loadPendingDayCloses` expose `expectedCash` / `cashVariance` **unmasked** → Warehouse (reconcile-only) sees cash, contradicting the matrix | Server loader |
| Low | V4 | Requests-engine decide actions thin at the action layer (DB-enforced) — defense-in-depth inconsistency, **not** an escalation | Action/RPC |
| Low | V5 | Approver inboxes (`reopen-approvals`, `cash-handovers`, `customer-requests`) have pages + enforcement but **no nav item** (hub-card only) | Nav/UX |
| Low | V6 | `documents.print` granted but **not enforced** anywhere (only share/export gate the PDF route) | Route |
| Info | V7 | Mobile **Approvals** bottom tab gated by a single perm vs desktop's 8-perm OR (under-exposure); Statement/Summary/Custody/My-Returns are "More"-drawer only | Mobile nav |

V1–V3 are the items that make a documented behavior **false in implementation**.
V4–V7 are correctness/discoverability notes (V5/V6 overlap the already-known L1–L4).

---

## B. Per-role audit — the 8 dimensions

Scored against the wiring. "PASS w/ note" = matrix holds, with a caveat to confirm
live. Full evidence in §D.

| Dimension | Result | Notes |
|---|---|---|
| 1. Menu visibility | **PASS** | `visibleSections` gating matches the documented per-role nav for all 8 roles. |
| 2. Page access | **PASS** | Every FMCG `page.tsx` enforces a permission (or role) guard — none are auth-only. |
| 3. Direct-URL access | **PASS (pages)** | Page guards `redirect`/`notFound` on direct URL. Gaps are at the **RPC** layer (V1/V2), not page URLs. |
| 4. Action permission | **PASS w/ gaps** | Money-path actions gated by `requireActionPermission`. RPC gaps V1/V2; action-layer thinness V4 (DB-enforced). |
| 5. Mobile navigation | **PASS** | No approval/override surface over-exposed on mobile. V7 (narrower Approvals tab; field views in "More"). |
| 6. Report visibility | **FAIL (V3)** | Cash masking correct in settlement board + day-close report; **missing** in review + pending-queue loaders. |
| 7. Print / Export / Share | **PASS w/ note** | PDF route gated by `documents.share ∨ export` + SA, audited (best-effort). `documents.print` unenforced (V6). Role grants match matrix (Warehouse no-share, Auditor export-only). |
| 8. Override access | **PASS (clean)** | All `erp_override_*` / `erp_reopen_*` RPCs: `erp_guard_rpc` + `REVOKE FROM anon` + branch-access + reason-required + audit. Override page gated by the 3 override perms. |

---

## C. Role × Screen × Action matrix (Expected / Actual / Pass-Fail)

Representative rows for each role plus **every** failing row. `SA`=super-admin bypass
present. Evidence in §D.

### Salesman
| Screen | Action | Expected | Actual | P/F |
|---|---|---|---|---|
| Today | open | visible (field.sales/role) | guard `field.sales`∨role∨SA | ✅ |
| Sell / Collect / Return | perform | allowed (field.sales) | `requireActionPermission('field.sales'/'returns.create'/'sales.collect')` | ✅ |
| End Day | submit | allowed (day.close.submit) | `requireActionPermission('day.close.submit')` | ✅ |
| Day-Close Approvals | open | hidden/blocked | page guard redirects (no stage perm) | ✅ |
| Override Center | open | hidden/blocked | page guard redirects (no override perm) | ✅ |
| Cash Custody (own) | view | own custody, no mask needed | `loadMyCashCustody` auth-only (own session) | ✅ |
| Credit limit (Statement) | view | hidden | `canViewCreditLimit=false` (no `customers.view_credit`) | ✅ |

### Supervisor
| Screen | Action | Expected | Actual | P/F |
|---|---|---|---|---|
| Return Approvals | approve/reject | allowed | `requireActionPermission('returns.approve'/'reject')` | ✅ |
| Day-Close Approvals | act stage | allowed (assigned + SoD) | gate + `canActOnStage` | ✅ |
| Reports group | open | visible (reports.view) | page guards OR `reports.view` | ✅ |
| Override Center | open | hidden (no grant) | page guard redirects | ✅ |
| Day-Close Report | cash | visible (cash.view_outstanding) | `canViewCash=true` | ✅ |

### Warehouse
| Screen | Action | Expected | Actual | P/F |
|---|---|---|---|---|
| Day-Close Approvals | reconcile | allowed (day.close.reconcile) | `requireActionPermission('day.close.reconcile')` | ✅ |
| Settlement board | cash columns | **hidden** | `loadDayCloseSettlementBoard` zeroes cash unless `cash.view_outstanding`∨settle | ✅ |
| Day-Close Report | cash | **hidden** | `loadDayCloseReport` masks cash | ✅ |
| **Pending day-close queue** | **cashVariance** | **hidden** | `loadPendingDayCloses` returns `cashVariance` **raw** (day-close-server.ts:508) | ❌ **V3** |
| **Day-close review detail** | **expectedCash** | **hidden** | `loadDayCloseReview` returns `expectedCash` auth-only, **no mask** (day-close-server.ts:454/463) | ❌ **V3** |
| Statement / Summary / Custody | open | hidden | nav + page guards exclude (no field.sales/collect/reports) | ✅ |
| Share a document | share | **not allowed** | role lacks `documents.share`; PDF route requires share∨export | ✅ |

### Cashier
| Screen | Action | Expected | Actual | P/F |
|---|---|---|---|---|
| Settlement | settle (full/partial) | allowed (day.close.settle) | `requireActionPermission('day.close.settle')`+`actorAllowed` | ✅ |
| Day-Close Report | cash | visible | `canViewCash` includes `day.close.settle` | ✅ |
| Daily Summary | open | hidden | nav+page guard exclude (no reports.view/field.sales) | ✅ |
| Credit limit | view | hidden | no `customers.view_credit` | ✅ |

### Accountant
| Screen | Action | Expected | Actual | P/F |
|---|---|---|---|---|
| Settlement | settle | allowed | `day.close.settle` gate | ✅ |
| Reports group | open | visible | `reports.view` | ✅ |
| Reconcile stock | perform | blocked | no `day.close.reconcile` → action gate fails | ✅ |

### Auditor
| Screen | Action | Expected | Actual | P/F |
|---|---|---|---|---|
| Reports group | open | visible (read) | page guards OR `audit.view`/`reports.view` | ✅ |
| Any mutation | perform | **blocked** | no act perms; action gates fail | ✅ ⧖ |
| Cash / credit columns | view | visible (oversight) | holds `cash.view_outstanding`+`customers.view_credit` | ✅ |
| Print / Share | perform | **export only** | role lacks print/share; PDF route allows export | ✅ |
| Override History | open | visible | guard OR `audit.view` | ✅ |

### Branch Manager
| Screen | Action | Expected | Actual | P/F |
|---|---|---|---|---|
| Return + day-close approvals | act | allowed | stage gates pass | ✅ |
| Settings → Day-Close Policy | open | **blocked** | guard `settings.workflow_policy` (not held) → redirect | ✅ |
| Override Center | open | hidden (default) | page guard redirects (no override perm) | ✅ |
| Override Center (if granted) | open | visible | guard OR override perms | ✅ ⧖ |

### Company Admin
| Screen | Action | Expected | Actual | P/F |
|---|---|---|---|---|
| Return/Day-Close Policy | edit | allowed | `requireCompanyAdmin` → `settings.workflow_policy` (ALL) | ✅ |
| Override Center | force/reopen | allowed (reason+audit) | ALL perms; `erp_override_*` guarded+audited | ✅ |
| Feature flags | toggle | allowed | `settings.users` | ✅ |
| `/platform/*` owner pages | open | blocked (vendor tier) | `platformOwnerOnly` excludes tenants | ✅ |

### Cross-role — direct RPC (the V1/V2 escalation rows)
| Caller | Action | Expected | Actual | P/F |
|---|---|---|---|---|
| Any authenticated user | `POST /rpc/erp_day_close_try_close` | blocked (no perm) | **no guard, no REVOKE → executes**, flips request→closed + closes work session | ❌ **V1** |
| Authenticated w/ branch access | `POST /rpc/erp_van_return` | needs `field.sales` | **no `erp_guard_rpc`** → branch-access only; posts return/restock/credit note | ❌ **V2** |
| Authenticated w/ branch access | `POST /rpc/erp_decide_van_return` | needs `returns.approve/reject` | **no `erp_guard_rpc`** → branch-access + no-self only | ❌ **V2** |
| anon | any of the above | blocked | `erp_has_branch_access` blocks (null `auth.uid()`); V1 takes no branch arg → **relies on RLS only** | ⧖ |

---

## D. The five required risk categories

### 1. Hidden but accessible pages (nav-hidden, URL-reachable)
**None at the page layer.** Every FMCG `page.tsx` enforces a permission/role guard
that `redirect`s/`notFound`s on direct URL — verified for all 26 routes under
`field/van-sales/` plus `today`, `supervisor`, `settings/returns`, `settings/day-close`.
*Caveat:* `field/van-sales/page.tsx:51` and `today/page.tsx:25` use **role-based**
fallbacks (e.g. membership role `salesman`/`admin`/`manager`/`supervisor`) in addition
to permissions — a user with the role but not the permission still passes. Intentional,
but flag for the permission-purist matrix. The real "accessible without the matrix
permission" cases are at the **RPC** layer (V1/V2), not page URLs.

### 2. Visible but non-functional pages
**None found.** Every nav-exposed FMCG page has a working loader + actions. The
inverse (functional but not nav-exposed) is category 3.

### 3. Implemented backend features not exposed in UI
- **`reopen-approvals`** (`day.reopen.approve`), **`cash-handovers`**
  (`cash.handover.confirm`), **`customer-requests`** (`customer.request.approve`):
  full page + server action + guarded RPC, but **zero `navigation.ts` entries**.
  Reachable only as conditional cards on the `/field/van-sales` "My Day" hub — which
  **redirects unified salesmen to `/today`** — so an approver with a non-salesman role
  can reach them only by typing the URL. (**V5**; flag-gated by `platform.day_reopen` /
  `platform.salesman_requests`, both default OFF — dormant unless enabled for pilot.)
- **`/field/van-sales/reports`** (`field.sales ∨ stock.adjust`) and
  **`/field/van-sales/warehouse`** (`stock.adjust`): pages exist with guards; no nav
  item located — likely tile/hub-reached. ⧖ confirm whether intentionally hub-only.
- Embedded actions without their own nav (by design): `withdrawDayClose`,
  `requestDayReopen` — surfaced inline in the day-gate/workspace. Not gaps.

### 4. UI pages without permission enforcement
**None.** No FMCG page is auth-only. Two are **role-gated rather than
permission-gated** (`today`, `supervisor`) and one allows a **role fallback**
(`field/van-sales` hub) — these enforce *access*, just not via a single permission key.
Note `settings/returns` + `settings/day-close` gate on `settings.workflow_policy` via
`hasPermission(...)`, which already grants super-admin/platform-owner — **no escalation**
(the earlier "no SA fallback" observation is a non-issue: `hasPermission` covers SA).

### 5. Role escalation risks
- **V1 (High):** `erp_day_close_try_close` — `SECURITY DEFINER`, no `erp_guard_rpc`,
  **no `REVOKE EXECUTE`**. An authenticated user can call it via PostgREST to flip a
  day-close request to `closed` and close the work session, bypassing the
  Supervisor/Settlement/Reconciliation gates entirely. It is meant to be an internal
  helper of the guarded submit/decide/settle/reconcile RPCs. **Fix: one-line
  `REVOKE EXECUTE ON FUNCTION public.erp_day_close_try_close(uuid) FROM anon, public;`**
  (and ideally make it a guarded entry or keep it strictly internal).
- **V2 (Medium):** `erp_van_return` / `erp_decide_van_return` — `SECURITY DEFINER`, no
  `erp_guard_rpc`, `REVOKE … FROM anon` **only** (the codebase's hardened RPCs use
  `FROM anon, public`). Authorization rests solely on `erp_has_branch_access` + a
  self-approval check, so any authenticated user with branch access can post or approve
  a van return directly, bypassing the action-layer `field.sales` / `returns.approve`
  gates. **Fix: add `PERFORM erp_guard_rpc('returns.create')` / `('returns.approve'|
  'returns.reject')` inside the functions and `REVOKE … FROM anon, public`.**
- **V4 (Low):** action-layer thinness on requests-engine decides — **mitigated**: the
  RPCs self-enforce (`erp_user_has_perm(...)`, no-self, cross-tenant) and
  `REVOKE … FROM anon, public`. Defense-in-depth inconsistency only; add
  `requireActionPermission` for symmetry post-pilot.
- No escalation via nav, mobile, override, or settings paths.

---

## E. Disposition (against the freeze)

The freeze permits fixing **discovered issues** within "no new modules/workflows/
architecture." V1–V3 are **hardening/correctness on existing surfaces** (a REVOKE, two
`erp_guard_rpc` calls, and applying the existing `canViewCash` mask idiom) — not new
features. Recommended handling **before pilot start**:

| ID | Sev | Fix (scope) | Recommendation |
|---|---|---|---|
| V1 | High | 1-line `REVOKE` migration on `erp_day_close_try_close` | **Fix pre-pilot** (security) |
| V2 | Medium | Add `erp_guard_rpc` + `REVOKE … anon, public` to 2 return RPCs | **Fix pre-pilot** (security) |
| V3 | Medium | Apply existing `canViewCash` mask in 2 loaders | **Fix pre-pilot** (matrix correctness) |
| V4 | Low | Add `requireActionPermission` to requests decides (symmetry) | Post-pilot (already DB-safe) |
| V5 | Low | Nav entries for the 3 approver inboxes (or fold into queue) | Post-pilot (overlaps L3/L4; flags OFF) |
| V6 | Low | Enforce or reserve `documents.print` | Post-pilot (= L2) |
| V7 | Info | Widen mobile Approvals tab perm OR | Post-pilot UX |

**⧖ Runtime-confirm in pilot (§3 scripts):** Auditor renders zero action buttons;
Branch-Manager granted-override state; anon cannot reach V1 via RLS; the role-fallback
pages (`today`, hub) behave per matrix for permission-only users.

---

## F. Evidence index (file:line)

- Page guards: `src/app/(app)/field/van-sales/**/page.tsx` (all 26), `today/page.tsx:25`,
  `supervisor/page.tsx:20`, `settings/returns/page.tsx:25`, `settings/day-close/page.tsx:24`.
- Action gates: `src/lib/erp/guards.ts:48` (`requireActionPermission`),
  `src/lib/van-sales/returns-server.ts` (95/361/450/508/564/661/746),
  `day-close-server.ts` (71/91/132/153/220 gates; 264/432/470 loaders; 373/608 masks),
  `override-server.ts` (29/44/57/88/165), `requests-server.ts` (decides 86/215 thin;
  RPC-enforced), `day-reopen-server.ts` (33/59 thin; RPC-enforced).
- RPC guards: `0330` (submit/decide/settle/reconcile guarded + REVOKE anon),
  `0332` (override/reopen guarded + REVOKE), `0266`/`0324` (return RPCs — **no guard**,
  REVOKE anon only), `0330` (`erp_day_close_try_close` — **no guard, no REVOKE**),
  `0308`/`0309`/`0310`/`0312` (requests engine — `erp_user_has_perm` + REVOKE anon,public).
- PDF route: `src/app/api/pdf/[doc]/[id]/route.ts:32` (share∨export+SA), `:44` (audit best-effort).
- Mobile nav: `src/components/layout/bottom-nav-tabs.ts:44/107`, `bottom-nav.tsx:44`.
