# VANTORA — Platform UX / Navigation / Performance Review

*Read-only review grounded in the live app (App Router pages, `navigation.ts`, layout/sidebar/bottom-nav, list pages, dashboard, onboarding) · no code changed · no merge · no production migrations.*

---

## Executive summary

The platform has a **solid UX backbone**: a grouped sidebar + command palette (⌘K), a mobile bottom-nav + drawer, card-vs-table responsive lists, a shared `EmptyState`, an app-level error boundary (Sentry + retry) and loading skeleton, and **CI-enforced ar/en parity**. Transactional lists (Invoices, Orders) are **server-paginated with debounced search**.

The gaps are concentrated in **a few high-volume list screens** (Customers, Products, Suppliers, Inventory) that **load all rows unbounded**, some **without search or empty states** — and the Customers list now also runs **per-row governance redaction**. None are architectural; all are contained, well-understood fixes. **Verdict: pilot-ready after a small Must-Fix set**, with a clear path to scale.

## Per-persona findings

### 1. Platform Owner
- Dedicated provider nav section (5 items) + redirect to `/platform`; companies, audit log, billing reachable. **Good.**
- Cross-company field-template/copy actions exist (DFG) but **no Platform UI** for company→company copy yet (server action only). *(Should-Fix; already noted in DFG.)*

### 2. Company Admin
- Settings is **18 items across 5 labeled subsections** (Organization / Data & Fields / Integrations / Governance / Personal) — discoverable. **Good.**
- Field Governance, Customer Data, Custom Fields, Workflows, Audit all present and permission-gated. **Good.**
- Onboarding (`/onboarding` self-service company creation) → `/setup` wizard (business-type profiles) → app, with layout redirects. **Good.**

### 3. Operational users (Sales Rep / Supervisor / Finance / Collection / Warehouse)
- Module + permission gating keeps each role's nav tight; mobile bottom-nav gives Home/Customers/Invoices/Inventory quick tabs. **Good.**
- **All roles land on the same general sales dashboard** — not tailored (a collector wants overdue/AR; a warehouse keeper wants low-stock/transfers; a rep wants today's route/visits/collections). *(Should-Fix.)*
- Reps browse **Products with no search** and an **unbounded list** — painful at FMCG SKU counts. *(Must-Fix.)*

## 13-point lens

| # | Lens | Status | Note |
|---|---|---|---|
| 1 | Navigation structure | ✅ Good | 16 module sections + grouped Settings; module/permission gated; ⌘K palette |
| 2 | Screen grouping | ✅ Good | Settings subsections labeled; module sections clear |
| 3 | Click-count reduction | ◐ Fair | ⌘K helps; **no dashboard quick-create / mobile "＋"**; palette searches nav only, not records |
| 4 | Search experience | ◐ Mixed | Server search on Invoices/Orders; **client-only on Customers; none on Products/Suppliers/Inventory** |
| 5 | Quick actions | ◐ Fair | Per-list primary buttons exist; no global/dashboard quick actions |
| 6 | Empty states | ◐ Mixed | Shared component widely used; **missing on Products/Suppliers/Inventory** |
| 7 | Error messages | ✅ Good | App `error.tsx` (Sentry+retry), `loading.tsx` skeleton, toasts, friendly server-action errors; **no `not-found.tsx`** |
| 8 | Mobile usability | ✅ Good | Cards vs tables, bottom-nav + drawer, `pb-24` safe-area; responsive top-bar |
| 9 | Arabic / English | ✅ Strong | CI-enforced parity + keys-usage; locale-aware currency/date; 1 intentional AR WhatsApp template |
| 10 | Performance bottlenecks | ◐ Watch | **Unbounded Customers `select('*')` + per-row `resolveLayout` redaction**; dashboard full-table `balance`/stock scans |
| 11 | Large-list handling | ◐ Mixed | Invoices/Orders paginated (`.range`, 20/pg); **Customers/Products/Suppliers/Inventory load all rows**; no virtualization |
| 12 | Dashboard usability | ◐ Fair | Good stat cards + getting-started checklist + recent invoices/low-stock; **not role-tailored** |
| 13 | Onboarding | ✅ Good | `/onboarding` + `/setup` wizard + layout guards; getting-started checklist |

## Triage

### 🔴 Must Fix Before Pilot
- **M1 — Search + empty state on the Products list.** FMCG SKU volumes make an unbounded, search-less Products screen unusable for reps/admins. Reuse the existing `ListSearch`/in-memory filter + `EmptyState`. *(Lens 4, 6, 11.)*
- **M2 — Empty states on Suppliers & Inventory** (and a basic search box). First-run pilot screens otherwise render blank/“broken”. Cheap (shared `EmptyState`). *(Lens 6.)*
- **M3 — Customers-list scale guard.** Unbounded `select('*')` + **per-row governance redaction** is fine at the pilot's ≤~2–3k customers but degrades beyond. Either confirm the pilot book stays under that, or paginate before loading a large customer base (see S1). *(Lens 10, 11.)*

### 🟠 Should Fix Before First Paying Customer
- **S1 — Uniform server pagination + debounced search** for Customers, Products, Suppliers, Inventory (mirror the Invoices/Orders `.range()` + `ListSearch` pattern). Removes the in-memory ceiling. *(Lens 4, 11.)*
- **S2 — Redact governance per rendered page** once Customers is paginated (resolve only the visible rows). *(Lens 10.)*
- **S3 — Role-tailored dashboards** (rep: route/visits/collections today · finance: AR aging/overdue · collection: due list · warehouse: low-stock/transfers/requests). *(Lens 12.)*
- **S4 — Global quick-create** (dashboard + mobile "＋"): New Invoice / New Customer / Record Payment; extend ⌘K to **jump to a record** (customer/invoice by code). *(Lens 3, 5.)*
- **S5 — `not-found.tsx`** with app chrome for unknown routes/records. *(Lens 7.)*
- **S6 — Platform UI for company→company field-config copy** (server action exists). *(Platform Owner.)*

### 🟢 Can Wait Until Later
- **C1 — Row virtualization** (react-window) for very large tables.
- **C2 — Saved filters / column preferences** per user.
- **C3 — Dashboard drill-downs & charts.**
- **C4 — Offline/PWA + mobile-camera for reps** (camera already in the attachments backlog).
- **C5 — Localize the WhatsApp renewal template** (currently AR-only by design).
- **C6 — Archived-record filters** on dashboard scans (exclude inactive from `balance`/stock aggregates).

---

# Part B — Architecture & Performance Remediation Plan

Concrete remediation for the four architectural risks from the DFG Completion Report, each with a recommended approach and a Must/Should/Can-Wait classification.

## R1 — Publish/Rollback multi-step → single transactional RPC
**Today:** publish/rollback run as 3 sequential client calls (read snapshot → `update` archive current published → `insert` new published; rollback also clears+restores live tables). Not atomic; a failure between archive and insert leaves no published version for a moment.
**Why it's not severe today:** the resolver falls back **published → live draft → registry**, so a failed publish degrades to the live draft (what admins see anyway), not breakage. The partial-unique index already prevents two published rows.
**Recommended approach:** move both into **`SECURITY DEFINER` Postgres functions** so each runs in **one transaction**:
- `erp_field_governance_publish(p_entity text, p_label text)` — build the snapshot inside SQL via `jsonb_build_object('config', (select jsonb_agg(...) ...), 'access', ..., 'sections', ...)`, compute `version_no`, archive current published, insert new published — atomically.
- `erp_field_governance_rollback(p_entity, p_version)` — within one tx: clear live `config/access/sections`, re-insert from the target snapshot, archive current published, insert the republished version.
- Both `erp_is_company_admin(company)`-gated; on any error the whole tx rolls back (invariant + atomicity guaranteed).
**Classification: 🟠 Should-Fix Before First Paying Customer.** (Not pilot-blocking — the pilot typically runs zero published versions; harden before customers rely on draft/publish.)

## R2 — Per-row governance redaction on large customer lists
**Today:** `customers/page.tsx` loads **all** customers (`select('*')`) then calls `resolveLayout(gov, row)` per row to null hidden fields. `loadGovernanceInputs` runs once (good); the per-row cost is O(rows × governed-fields).
**Impact:** ≤~2–3k customers × ~20–30 fields ≈ tens of thousands of ops + a few-thousand-row payload → fine for the pilot. At 50k+ customers it becomes a memory + CPU + serialization problem — but the **dominant** cost there is the **unbounded fetch**, not the resolve.
**Recommended approach (ranked):**
1. **Pagination (root fix, = UX S1):** server-paginate the customer list (Invoices/Orders pattern, `.range()` 20–50/pg). Bounds memory and per-row resolve to one page. **Biggest lever.**
2. **Redact per rendered page (= S2):** resolve only the visible rows.
3. **Split static vs conditional redaction:** precompute the **role/permission-based hidden set once per request** (independent of row data) and apply it to all rows; per-row, evaluate **only fields that carry a `condition`**. This removes per-row work for the common (role-based) case.
4. **Cache governance inputs:** wrap `loadGovernanceInputs` in `react`/`unstable_cache` keyed by (company, entity, published-version-id) — config changes rarely; avoids re-reading the snapshot every request.
5. **Indexing:** none needed for governance tables (tiny, already indexed on `company_id,entity`); the customer fetch itself benefits from the **0110 composite indexes**.
6. **Virtualization:** client-only render aid for huge tables — secondary to pagination.
**Classification: 🟠 Should-Fix Before First Paying Customer** (items 1–3 together), with a **🔴 Must-Fix pilot guard (M3):** keep the customer book under ~2–3k until pagination lands.

## R3 — Long unmerged stack (#78 → #79 → #80 → #81)
**Today:** four stacked draft PRs, all green: #78 Attachments (0111) → #79 FP-0 (0112) → #80 FP-CS (0113) → #81 DFG (0114–0117). The 0110 composite-index package is a **separate** PR. Migration numbers must apply in order: …0109 → **0110** → 0111 → 0112 → 0113 → 0114 → 0115 → 0116 → 0117.
**Recommended safe merge/review strategy:**
1. **Rebase the bottom of the stack onto the current integration/main branch** (the stack was based off `claude/customer-approval-design`); confirm that base PR (customer-approval, 0109) is merged or first in line.
2. **Sequence in 0110** (composite indexes) **before** the stack so numbering stays contiguous and the index package lands ahead of the high-volume features that rely on it.
3. **Merge bottom-up, one PR at a time, after review:** customer-approval (0109) → indexes (0110) → #78 (0111) → #79 (0112) → #80 (0113) → #81 (0114–0117). GitHub auto-retargets each stacked PR's base as its parent merges.
4. **Re-run the "Apply migrations to STAGING" job after each merge** to prove the chain applies in integration order.
5. **Production:** apply migrations **only after the full merge + staging validation**, in number order, in one guarded window — keep the production job guarded until then.
**Classification: 🔴 Must-Fix before pilot *deployment*** (it's the go-live gate, not the review gate — nothing merges until you approve).

## R4 — Field-value inheritance (Head Office → Branch)
**Current design state:** storage + hierarchy exist — `erp_field_config.inheritance` (`none`/`inherit`/`inherit_locked`), FP-0 `parent_customer_id`, and `erp_customer_ancestors/descendants/head_office` helpers. **Not yet wired** into resolution/forms (the column is inert; `SLICE-FIELD-PERMISSIONS §10.5`).
**Recommended implementation approach (when scheduled):**
- **Read — value resolution:** add pure `resolveFieldValue(field, record, parentRecord)` — for a **branch** record (`parent_customer_id` set): `inherit_locked` → always the parent (Head Office) value; `inherit` → branch value if set, else parent value. Head-office edits propagate **by reference at read-time** (no row copy).
- **Access clamp:** for a branch record, clamp `inherit_locked` fields to **view** (post-step after `resolveAccess`); keep locked for everyone (policy, not security) with changes made at the Head Office.
- **Write:** `applyWriteAccess` treats `inherit_locked`-on-branch as non-editable (revert to parent); `inherit` allows a local override (blank = inherit).
- **Form/loader:** when editing a branch, fetch the parent record once and pass its values (prefill/placeholder for inherited; read-only for locked).
- **Scope:** customer entity, single-level (FP-0). Pairs naturally with **FP-0c** (credit/consolidation), which also consumes the hierarchy.
**Classification: 🟢 Can-Wait (post-pilot)** — build alongside FP-0c; **🟠 Should-Fix before onboarding key-account (HO→branch) customers**. Until wired, **do not expose `inherit_locked` in the admin UI** (avoid implying behavior that isn't enforced yet).

## Architecture risks & mitigation (consolidated)
| Risk | Severity | Mitigation | Class |
|---|---|---|---|
| Publish/rollback not atomic (R1) | Low | Transactional RPCs | 🟠 Should |
| Long unmerged stack / migration order (R3) | Med | Rebase + ordered bottom-up merge + per-merge staging re-run; sequence 0110 | 🔴 Must (deploy) |
| Inheritance column inert (R4) | Low | Don't expose `inherit_locked`; wire with FP-0c | 🟢 Can-Wait |
| App-layer (not DB) read redaction | Low | Acceptable for single trusted app; DB column privileges post-pilot | 🟢 Can-Wait |

## Performance risks & mitigation (consolidated)
| Risk | Trigger | Mitigation | Class |
|---|---|---|---|
| Unbounded customer list + per-row redaction (R2) | >~3k customers | Pagination → per-page redaction → static/conditional split → cache inputs | 🟠 Should (🔴 guard M3) |
| Products/Suppliers/Inventory unbounded, no search | many SKUs | Search + pagination (M1/M2 → S1) | 🔴 Must (search) / 🟠 Should (pagination) |
| Dashboard full-table `balance`/stock scans | many rows | Filter active-only; pre-aggregate (ties to DB scalability review) | 🟠 Should |
| Per-request governance snapshot read | every page | Cache by (company, entity, published-version) | 🟢 Can-Wait |

## Recommended execution order
1. **Before pilot (🔴 Must):** M1 (Products search + empty) · M2 (Suppliers/Inventory empty + search) · M3 (customer-book scale guard ≤~3k) · **R3 merge plan prepared** (rebase + ordered sequence, incl. 0110) — executed at go-live.
2. **First hardening sprint (🟠 Should):** S1 uniform pagination + search → S2 per-page redaction + static/conditional split (closes R2) · R1 publish/rollback RPCs · S3 role-tailored dashboards · S5 `not-found.tsx` · S4 quick-create + ⌘K record-jump · S6 company-copy UI · dashboard active-only filters.
3. **Post-pilot (🟢 Can-Wait):** R4 field-value inheritance (with FP-0c) · DB column-level read privileges · virtualization · saved filters · dashboard charts · offline/PWA + mobile camera.

---

*Review & remediation plan only — no code changes, no merge, no production migrations.*
