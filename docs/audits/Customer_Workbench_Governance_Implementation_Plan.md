# Customer Workbench — Governance Enhancements: Implementation Plan & Effort

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-19 · **Status:** *Plan approved in scope; G1–G7 awaiting two decisions before coding. G8 (structured address) is design-only/deferred. No implementation in this document.*

**Method:** one focused, validated commit per phase (tsc · full suite · build · gap-check), same cadence as P5. Constraints: reuse existing engines; **no permission-model change**, **no RLS change**; existing credit/GPS/status critical-action flows untouched. Pricing excluded (separate workstream). Coverage items (visit frequency, coverage status, JP adherence, route optimization/balancing) deferred to the Coverage & Journey-Plan engine.

**Grounding (de-risks the estimate):** the change-request backbone is already wired (`upsertCustomer` writes `erp_customer_change_requests`; `workflow-handlers` approves/applies; integration test exists); orders are distinct from invoices (`erp_sales_orders`); `upsertCustomer` already reads old values and runs field-governance write-enforcement.

---

## Phases G1–G7 (approved scope)

| Phase | Scope | Reuses | New | Effort | Risk |
|---|---|---|---|---|---|
| **G1 — Read-only context** | Territory (route·region·area·salesman·visit day) + Commercial (credit limit·payment terms) on Overview | customer record; `SectionCard`/`SummaryList`; route-name lookup | small loader add | **S** (~½d) | Low |
| **G2 — Last Activity** | Last visit·order·invoice·collection·return on Overview | bundle timeline; statement | extend bundle loader: `erp_sales_orders` (last order) + last collection; pure last-per-kind | **M** (~1d) | Low |
| **G3 — Health band + score** | Health chip (header) + breakdown (Overview), beside master status | `customer-timeline/health` | adapter deriving inputs from bundle (no `erp_customer_timeline` activation); band thresholds | **M** (~1d) | Low–Med |
| **G4 — Transfer history** | prev→new salesman·route·region + reason·date·status | `erp_customer_transfers`; `RelatedChips`/table | read-only loader + section | **S–M** (~¾d) | Low |
| **G5 — Structured audit envelope** | standardise `details` to `{field, oldValue, newValue, role, reason, requestRef}` across direct-edits + applied requests | `logAudit`; existing old-value reads | envelope helper + apply at write sites | **M** (~1–1.5d) | Med |
| **G6 — Field governance default policy** | non-admins → `view` (→ request) on the 10 governed fields; Admin keeps `edit` | `resolveLayout` + existing write-enforcement | default access map (fallback) + tests | **M–L** (~1.5–2d) | Med–High |
| **G7 — Change Request UI** | deliberate "Request change" affordance + pending-request visibility | existing submit + approve/apply | submit affordance + pending surface | **M** (~1–1.5d) | Med |

**G1–G7 total: ~7–9 focused dev-days, 7 validated commits.**

**Open decisions before G3/G6:**
1. Health band thresholds (proposed: Active ≥ 70 · At-Risk 40–69 · Inactive < 40; Blocked = master-status override). Health chip sits *beside* the master-status badge.
2. Governance default rollout: all-companies baseline vs **opt-in toggle** (recommended) so live tenants aren't silently changed.

---

## G8 — Country-aware Structured Address (DESIGN ONLY — deferred, after G1–G7)

> No schema migration, no implementation now. Designed as a **multi-country** model, **not** KSA-only. The existing free-text `national_address` is **retained for backward compatibility**.

### Trigger
The KSA (SPL) National Address has 8 structured components (bilingual): Building Number / رقم المبنى · Street Name / اسم الشارع · District / الحي · City / المدينة · Postal Code / الرمز البريدي · Additional Number / الرقم الإضافي · Unit Number / رقم الوحدة (optional) · Short Address / العنوان المختصر. Other countries use different components — the model must be country-driven.

### Proposed model
- **Storage:** add an additive, nullable **`structured_address` JSONB** column on `erp_customers` (+ a resolved **`country_code`**, defaulting to the company country). JSONB holds country-keyed components. *Rejected alternatives:* discrete KSA columns (not multi-country); a separate `erp_customer_addresses` table (more flexible / multi-address, but heavier — park as a future option if multiple addresses per customer are needed).
- **Country-format registry (code/config):** per ISO-3166 country → ordered component list, bilingual/local labels, required/optional, and validation (e.g. KSA: postal code = 5 digits, additional number = 4 digits, short address = 4 letters + 4 digits `AAAA####`). KSA format = the 8 fields above; EG/AE/etc. define their own.
- **Compatibility:** keep `national_address` free-text; **derive** a formatted `national_address` string from the structured components on write, so every existing reader (statement, print, API, search) keeps working with zero changes.

### Cross-cutting impact
- **Governance:** structured-address components inherit the **National Address** sensitivity tier (Admin edit / non-admin request) as one governed group — reuses G6.
- **Audit:** component-level old→new diffs flow through the **G5 structured envelope** (JSONB diff per field).
- **Import/Export:** extend the customer CSV/Excel mapping with per-country structured columns + country-specific templates; export emits both structured + derived free-text.
- **API:** integrations read/write both — accept structured **or** free-text; always return the derived free-text for compat; structured optional.
- **Multi-country:** format/labels/validation resolve per customer `country_code`; company may operate across countries; KSA-specific concepts (Short Address) simply absent from other formats.

### Migration strategy (phased; only after G1–G7 and explicit approval)
1. **Design** (this section) — model + format registry. *No schema.*
2. **Additive schema** — add `structured_address` JSONB (+ `country_code`), nullable, no backfill.
3. **Form + governance + display** — render country-format fields; write structured **and** derived free-text; governance/audit via G5/G6.
4. **Import/Export + API** — mappings, templates, dual read/write.
5. **Optional best-effort backfill** — non-destructive parse of existing free-text into components (low priority).

### Rollout
**Opt-in per company** (enable structured address + set country); free-text remains the default; **no forced migration** of existing customer data.

### Complexity estimate (JSONB approach)
Schema (S) · format registry (M) · form rendering (M) · governance/audit reuse (S) · import/export (M) · API (S–M) ≈ **4–6 dev-days** as a dedicated phase **after** G1–G7. The separate-table (multi-address) variant adds ~2–3 days and is deferred unless multi-address is required.

---

## Suggested sequence
G1 → G2 → G3 (display/value, low risk) → G4 → **G5 → G6 → G7** (governance core) → **G8 design review → (separate approval) G8 build**. One validated commit per phase; report before each next phase.
