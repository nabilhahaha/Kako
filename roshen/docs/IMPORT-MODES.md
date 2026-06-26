# Import Modes & Overlap-Aware Reconciliation

Agents may upload **daily, weekly, monthly, or custom-period** data. The system
**never blindly replaces or appends** — it detects what the file contains,
compares it to existing imported data, **recommends** the safest mode, and
**requires user confirmation** on an Import Mode decision screen before commit.

Schema support (in `0001`): `import_batch.import_mode`, `period_start/period_end`,
`confirmed_by`, `mapping_version_id`, `calculation_policy`; `sales_fact.line_hash`
for line-level comparison; `status = superseded` for replaced data.

---

## 1. Detection on every upload
From the parsed rows the engine determines:
- **agent/distributor** (upload context),
- **reporting date range** from `invoice_date` (min/max → `period_start/end`),
- **reporting month(s)** covered,
- **overlap** with existing imported data for that agent,
- which rows **already exist**, which are **new**, and which **existing invoice
  lines changed value** — by comparing `line_hash`.

## 2. Import Mode decision screen (before commit)

| Mode | Use when | Behavior |
|---|---|---|
| **A) Full Period Replacement / Supersede** | file is a full report for a period/month | Replace active imported data for that agent + range; old batch → `superseded` (raw + audit kept); new batch active |
| **B) Incremental Append** | file has only new daily/weekly rows | Add only **new** rows; duplicates skipped/warned; existing rows not overwritten unless explicitly confirmed |
| **C) Replace Overlapping Period** | file has old + new (e.g. 1–11 May when 1–10 exists) | Replace only the **overlapping** date range; add dates outside it; keep superseded history for replaced rows |
| **D) Correction / Reprocess** | correct prior data via new file / new mapping version | New corrected batch; affected prior batch/rows → `superseded`; full audit kept; raw never rewritten |

## 3. Recommendation logic (system suggests, user decides)
- **No overlap** → recommend **Incremental Append (B)**.
- Same agent + same month, file covers **full/most of month** → recommend **Full
  Period Replacement (A)**.
- **Partial overlap + new dates** → recommend **Replace Overlapping Period (C)**.
- Same invoice lines exist but **values changed** → **warn** and recommend
  **Correction/Reprocess (D)** or **Replace Overlapping (C)**.
- Duplicates with **identical values** → shown as **duplicate/ignored** rows.

## 4. Confirmation summary (always shown before commit)
- selected **agent**
- **date range** detected (`period_start`–`period_end`, month(s))
- **existing imported coverage** for the agent
- **new rows** count
- **duplicate rows** count
- **changed existing rows** count
- **recommended** import mode
- **final mode selected** by the user
- **impact summary** (what becomes superseded / added / skipped) before commit

## 5. Dedupe / comparison key (`line_hash`)
Primary line key:
`agent_id + invoice_number + invoice_date + customer_code +
item_code/roshen_item_code + line_id` (when `line_id` exists).

Fallback **stable row hash** when no `line_id`:
`hash(agent_id, invoice_number, invoice_date, customer_code, item_code,
quantity, sales_value_ex_vat, returns_value, discount)`.

`line_hash` is stored on every `sales_fact` row; **value change** = same key,
different hash → flagged as a changed line.

## 6. Safety guarantees
- **Never delete raw history** (`raw_import_row` retained for all batches).
- **Never silently overwrite** active data — any replacement marks old data
  `superseded`.
- Every batch stores: `import_mode`, `period_start/period_end` (date range),
  `mapping_version_id`, `calculation_policy` (snapshot), `uploaded_by`, and
  `confirmed_by` (approver).

---

## Default MVP behavior
The system **auto-recommends the safest mode** per the logic above, but the
**user must confirm** before commit. When unsure (e.g. same agent + same month
covering the full month), the recommendation defaults to **Full Period
Replacement / Supersede**, consistent with the re-upload default in
`IMPORT-DRIFT-AND-REUPLOAD.md`.
