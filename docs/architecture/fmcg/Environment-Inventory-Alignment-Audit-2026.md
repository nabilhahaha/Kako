# Environment Inventory & Alignment Audit — FMCG Pilot

Governance audit of all Supabase projects and their alignment to the FMCG pilot, before any
further fixes. Every row below is from a direct runtime probe (table existence + user/tenant
markers), not inference. Official source of truth: **vantora-staging**.

---

## 1. All Supabase projects in the organization (org `jokszanzlgcsecfnztvk`)

| Project (ref) | Name | Created | ERP schema? | FMCG suite? | Users |
|---|---|---|:--:|:--:|--:|
| `rsjvgehvastmawzwnqcs` | **vantora-staging** | 2026-06-10 | Yes | **Yes (full)** | 9 pilot |
| `nrvydmkxjnctdlaxdhur` | **kako-fmcg** | 2026-05-28 | Yes (base) | **No** | 62 |
| `qulukfxuaklhcztchrbv` | **field-insights** | 2026-06-16 | No | No | 0 |
| `njgjrktszvogivhbplbn` | **near-expiry-roshen** | 2026-05-17 | No | No | 80 |

## 2. Purpose of each environment

- **vantora-staging** (`rsjvgehvastmawzwnqcs`) — **Staging / FMCG pilot source of truth.** Holds
  the full FMCG van-sales suite, the pilot tenant, all flags, and the 8 pilot role accounts.
- **kako-fmcg** (`nrvydmkxjnctdlaxdhur`) — **Base/older ERP** (companies + roles, 62 users) **without**
  the FMCG van-sales suite. Created earlier (2026-05-28). Most consistent with the kako app's
  original/production-line database; **not** carrying the FMCG pilot migrations.
- **field-insights** (`qulukfxuaklhcztchrbv`) — **Separate product** ("Field Insights" app; its own
  32-table schema, 0 users, no ERP). This is the unrelated monorepo subproject whose Vercel builds
  fail independently. **Out of scope** for the FMCG pilot.
- **near-expiry-roshen** (`njgjrktszvogivhbplbn`) — **Separate demo/experimental** (pharmacy /
  near-expiry, "Roshen"; 27 tables, 80 users, no ERP). **Out of scope.**

## 3. Vercel → Supabase mapping

| Vercel project | Deployment | Supabase backend | Basis |
|---|---|---|---|
| `kako` (`prj_5Ksx…`) | **Preview** (branch `claude/fmcg-sell-collect-loop`) | **vantora-staging** | **Verified** — runtime logs show pilot-company customer IDs (Al Nour, El Salam, Family Supermarket, City Mini, Corner Shop @ `612af0bd`) |
| `kako` (`prj_5Ksx…`) | **Production** (`kako-gamma` / `kako-git-main`) | **kako-fmcg** *(inferred)* | ⚠️ **Not verified** — production env vars not readable via API; inferred from project naming + base-ERP schema. Owner should confirm `NEXT_PUBLIC_SUPABASE_URL` on the Production env. |
| `field-insights` (`prj_5oc2…`) | all | field-insights | Separate product |

**The pilot is being tested on the Preview deployment → vantora-staging. Confirmed.**

## 4. What each environment contains (probed)

| Marker | vantora-staging | kako-fmcg | field-insights | near-expiry-roshen |
|---|:--:|:--:|:--:|:--:|
| FMCG/ERP schema (`erp_companies`) | ✅ | ✅ (base) | ❌ | ❌ |
| Van Sales (`erp_van_sales_settings`) | ✅ | ❌ | ❌ | ❌ |
| Feature flags (`erp_feature_flags`) | ✅ | ❌ | ❌ | ❌ |
| Day-Close (`erp_day_close_requests`) | ✅ | ❌ | ❌ | ❌ |
| Return-Approval (`erp_return_approval_policies`) | ✅ | ❌ | ❌ | ❌ |
| Pilot tenant (`612af0bd`) | ✅ (1) | ❌ | ❌ | ❌ |
| Pilot users (`@pilot.test`) | ✅ (8+viewer) | ❌ (0) | ❌ (0) | ❌ (0) |

## 5. Official source of truth

**vantora-staging (`rsjvgehvastmawzwnqcs`)** — the only environment with the complete FMCG suite,
the pilot tenant, the flags, and the pilot users; and the verified backend of the Preview
deployment under test. All FMCG pilot work (migrations 0265→0334, V1, D1, flags, role config,
defect fixes) lives here.

---

## Environment Alignment Matrix

| Environment | Purpose | Active | Receives Fixes | Receives Pilot Changes | Status |
|---|---|:--:|:--:|:--:|---|
| **vantora-staging** | Staging / FMCG pilot **source of truth** | Yes | **Yes** | **Yes** | ✅ **Aligned (canonical)** |
| **kako-fmcg** | Base/older ERP (likely Production target) | Yes | No (pilot phase) | No | ⚠️ **Out of sync** — lacks the entire FMCG suite; sync only at production rollout |
| **field-insights** | Separate product (Field Insights) | Yes | N/A | N/A | ⛔ **Separate / out of scope** |
| **near-expiry-roshen** | Separate demo (pharmacy/Roshen) | Yes | N/A | N/A | ⛔ **Separate / out of scope** |

---

## Out-of-sync findings

1. **kako-fmcg has none of the FMCG van-sales suite** (no van-sales, flags, day-close,
   return-approval tables; no pilot tenant/users). If kako-fmcg is the kako **Production** DB,
   then **Production is behind Staging by the entire FMCG migration set** (0265→0334). This is
   expected during an online-first pilot (pilot runs on staging), **but must be addressed before
   any production rollout.**
2. **Production Vercel → Supabase binding is unverified** (env vars not API-readable). The owner
   should confirm the Production env's `NEXT_PUBLIC_SUPABASE_URL`. If Production points at
   kako-fmcg, the FMCG features are simply absent there (not broken) until migrated.
3. `field-insights` and `near-expiry-roshen` are **different products** — not out of sync; they
   must **not** receive FMCG changes.

## Governance rules (going forward)

- **Apply FMCG pilot fixes ONLY to vantora-staging.** (Already the case: V1/D1/flags/role-config
  are on vantora-staging; the DF-003 nav change is code, deployed to the Preview that reads
  vantora-staging.)
- **Never apply FMCG changes to field-insights or near-expiry-roshen** (separate products).
- **Do not blindly replicate** to kako-fmcg. Production sync is a deliberate, staged step (below).

## Migration / synchronization plan (staging → production)

**Do this only when the pilot is signed off and a production rollout is approved — not now.**

1. **Confirm the production backend** — read the kako Production env `NEXT_PUBLIC_SUPABASE_URL`
   (owner/devops). Establish whether it is `kako-fmcg` or another project.
2. **Take a backup/snapshot** of the production DB before any schema change.
3. **Apply the FMCG migration set in order** (`0265` … `0334`) to the production project via the
   migration pipeline (not ad-hoc SQL). This adds the van-sales/return/day-close schema, the
   `auditor` role (D1), and the `erp_day_close_try_close` REVOKE (V1).
4. **Provision per-company** (not global): enable Van Sales (`erp_van_sales_settings.is_enabled`),
   set the flags (`platform.return_approval`, `platform.day_close_approval`,
   `platform.salesman_requests`, `platform.unified_salesman_workspace`), and configure policies for
   each real distributor — using the Pilot Setup Checklist, not the demo seed.
5. **Carry the deployment env** — ensure `KAKO_VAN_SALES` is ON (default) on the production env.
6. **Validate on production** with the same runtime checks used on staging (authorization matrix,
   workflow chain, RLS isolation, audit trail) before enabling for real users.
7. **Keep V2/V3 dispositions** — apply the post-pilot fixes (or accept) consistently in both envs.

## Status

- Source of truth: **vantora-staging** — confirmed and canonical.
- Pilot fixes are correctly scoped to vantora-staging; no FMCG work has been applied to a
  legacy/demo-only environment.
- kako-fmcg flagged out-of-sync for **future production rollout only**; field-insights and
  near-expiry-roshen are separate products and excluded.
- Freeze preserved (this is governance/inventory — no code or schema change made here).
