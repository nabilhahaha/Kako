# Final Pilot Role & Permission Certification

**Certification:** the FMCG van-sales pilot role & permission model is **CERTIFIED
GO**. All role/permission changes are implemented, applied to the live pilot database,
runtime-verified per role, and regression-locked by tests.

**Environment binding (confirmed):**
- **Branch (SoT):** `claude/fmcg-sell-collect-loop` — now also merged to `main` (`0c7bf69`)
- **Deployment:** `kako-git-claude-fmcg-sell-collect-loop-123456789-s-projects.vercel.app`
- **Environment:** Vercel preview (kako project)
- **Database:** vantora-staging (`rsjvgehvastmawzwnqcs`), pilot company `612af0bd…`
- **Evidence:** live `erp_user_has_perm` probes acting as each of the 9 pilot accounts;
  full test suite 1540 passed.

---

## 1. Consolidated role × capability matrix (live, vantora-staging)

● = allowed · = denied. Probed as the real pilot account for each role.

| Role | Sell | Collect | **Reverse** | **Cash Box** | **Settle** | Reconcile | Supervise close | Accept cash | Approve returns | Approve requests | Audit view | Reports |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **salesman** (Sales Rep) | ● | ● | · | · | · | · | · | · | · | · | · | · |
| **supervisor** | · | · | · | · | · | ● | ● | ● | ● | ● | · | ● |
| **branch_manager** | ● | ● | · | · | · | ● | ● | ● | ● | ● | · | ● |
| **cashier** | ● | ● | · | ● | ● | · | · | ● | · | · | · | · |
| **accountant** | · | ● | ● | ● | ● | · | · | ● | · | · | · | ● |
| **warehouse_keeper** | · | · | · | · | · | ● | · | · | · | · | · | · |
| **auditor** | · | · | · | · | · | · | · | · | · | · | ● | ● |
| **viewer** | · | · | · | · | · | · | · | · | · | · | · | ● |
| **admin** | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |

(Reverse = `accounting.post`; Cash Box = `treasury.manage`; Settle = `day.close.settle`;
Reconcile = `day.close.reconcile`; Supervise close = `day.close.supervisor`;
Accept cash = `cash.handover.confirm`.)

---

## 2. Segregation-of-duties attestations (all VERIFIED)

| # | Separation enforced | Evidence |
|---|---|---|
| SoD-1 | **Collect ≠ Reverse** — reps/cashiers record collections; only Accountant/Admin reverse | salesman/supervisor/cashier reverse = · ; accountant/admin = ● |
| SoD-2 | **Settle ≠ Reconcile** — Cashier/Accountant settle cash; Supervisor/Branch Mgr/Warehouse reconcile | no non-admin role holds both settle and reconcile |
| SoD-3 | **Approve ≠ Execute** — Supervisor approves/reconciles but does NOT sell/collect/settle | supervisor sell/collect/settle = · ; supervise/approve = ● |
| SoD-4 | **Treasury isolation** — Cash Box (treasury.manage) excludes Sales Rep AND Supervisor | salesman/supervisor cashbox = · ; cashier/accountant/admin = ● |
| SoD-5 | **Settlement ownership** — exactly Cashier / Accountant / Admin (not Supervisor, not Branch Mgr) | settle ● only for cashier/accountant/admin |
| SoD-6 | **Auditor read-only** — audit + reports only, no mutation | auditor: audit_view+reports = ● ; all else = · |

---

## 3. Change log certified into this state

| Ref | Change | Layer | Status |
|---|---|---|---|
| V1 | Revoke `erp_day_close_try_close` from PUBLIC/anon/authenticated | DB (0333) | Closed |
| D1 | Seed `auditor` role + 11 read-only perms globally | DB (0334) + code | Closed |
| Supervisor #1 | Remove `sales.sell/collect/return/discount` (approver, not executor) | code + DB (0335) | Closed |
| Collection Reverse | Reverse gated on `accounting.post`; UI button hidden for non-Finance/Admin | code | Closed |
| C-2 Settlement SoD | Remove `day.close.settle` from **Supervisor** | code + DB (0336) | Closed |
| C-1 Treasury | New `treasury.manage`; re-gate Cash Box (page+actions+nav) off `sales.collect` | code + DB (0336) | Closed |
| Settlement final | Remove `day.close.settle` from **Branch Manager** | code + DB (0337) | Closed |
| C-4 Reconciliation | Keep Supervisor-owned reconciliation / Cashier-owned settlement | (no change) | Confirmed |

---

## 4. Validation & test evidence

- **Runtime:** every row of §1 probed live via `erp_user_has_perm` acting as the
  actual pilot user (not code defaults) — the same path RLS uses.
- **Direct-URL enforcement:** Cash Box (`/cashbox`) page + all three actions call
  `requirePermission('treasury.manage')`; Sales Rep & Supervisor are blocked at the
  guard, not merely nav-hidden.
- **Tests:** new SoD regression guards in `mj1-posting-permissions.test.ts`
  (reverse = accounting.post; cash box excludes rep+supervisor; settlement =
  cashier/accountant/admin only) and `permissions.test.ts` (supervisor approver-only).
  Full suite: **1540 passed, 0 failed**.

---

## 5. Documented (accepted) enforcement gaps — unchanged

| Ref | Gap | Disposition |
|---|---|---|
| V2 | (documented enforcement gap from the implementation audit) | Post-pilot |
| V3 | (documented enforcement gap from the implementation audit) | Post-pilot |

These remain documented known gaps, accepted for the pilot, to be addressed post-pilot.

---

## 6. Open operational items (not blocking certification)

1. **Migration number clash `0265`** on `main` (`0265_entitlements_company_feature_writes`
   vs `0265_van_sell`) — live DB unaffected; renumber before a fresh deploy.
2. **Branch cleanup** — review package delivered; 47 delete candidates + 231 archive
   candidates await your approval. Nothing deleted/archived yet.
3. **#310 residual** — `customer-data-update/actions.ts` + 2 readiness docx remain only
   on `form-builder-engine`; fold-in or archive decision pending.

---

## Certification statement

The pilot role & permission model — across **9 roles** and the core sell / collect /
reverse / treasury / settlement / reconciliation / approval / audit capabilities — is
**internally consistent, segregation-of-duties compliant, runtime-verified, and
test-locked**. **Certified GO for continued pilot operation.**

Environment, branch, deployment, and database are aligned (vantora-staging via the
`fmcg-sell-collect-loop` line, now merged to `main`).
