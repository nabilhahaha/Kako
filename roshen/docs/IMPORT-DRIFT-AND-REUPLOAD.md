# Import Drift & Re-upload Behavior

How the engine behaves when an agent uploads a file that **mostly matches** an
existing mapping but has small changes, and how re-uploads for the same agent +
month are handled. This builds on the existing schema (no new migration needed):
`column_mapping_version` (versioned), `import_batch.status` (incl. `superseded`),
`import_batch.mapping_version_id` + `calculation_policy` snapshots, `import_issue`,
and the line dedupe keys.

> **Default MVP rule:** for the **same agent + same reporting month**, use
> **Replace / Supersede** (mode A) — the safest default.

---

## 1. Same agent, known format, with EXTRA columns
- **Auto-load** the agent's default mapping version.
- **Detect** source headers not present in the saved `source_headers` →
  surface in preview as **"New unmapped columns."**
- User may: **ignore** them (kept in `raw_import_row.raw` regardless), **map**
  them to optional canonical fields, or **create a new mapping version**.
- **Extra columns never block import** (they're optional by definition).
- If the user maps any new column, that produces a **new version**; otherwise
  the existing version is reused and the extras simply live in raw.

## 2. Same agent, slightly RENAMED columns
- Use **aliases + fuzzy matching** (normalized header text, token overlap,
  known synonyms) to **suggest** a mapping for each unmatched canonical field.
- Show a **confidence score** per suggestion in the preview.
- **High confidence** (≥ threshold, e.g. 0.85): **auto-map**, but still display
  the suggestion in preview for review.
- **Low confidence**: leave **unmapped**, require **manual confirmation**.
- Confirming renamed mappings creates a **new mapping version** (the
  `source_headers`/`field_mapping` changed); historical batches keep their old
  version.

## 3. Same agent + same reporting month — two import modes
### A) Replace / Supersede  *(MVP default)*
- The new file **replaces** the active batch for that agent + month.
- The previous active batch → `status = 'superseded'`; the new one →
  `imported`. Enforced by the partial unique index
  `one_active_batch_per_agent_month` (only one `imported` batch per agent+month).
- **Raw rows and audit history are preserved** for the superseded batch
  (nothing deleted); reporting reads only the active batch.

### B) Append only new rows  *(optional, later)*
- Insert **only rows not already present**, using the **line dedupe key**:
  `invoice_number + invoice_date + customer_code + item_code + line_id`
  (when `line_id` exists), else a **hash** of
  `invoice_number + invoice_date + customer_code + item_code + quantity +
  sales/net value`.
- Existing matching rows are skipped (reported as duplicates in preview).
- Not the MVP default; offered explicitly when the agent sends incremental files.

## 4. Calculation policy changes
If the new file appears to change **sales value basis, discount handling, VAT
handling, or returns handling** (e.g. a previously-net column now looks gross, or
returns stop appearing as negative rows):
- **Do not silently continue.**
- Show a **warning** in preview describing the detected change.
- **Require user confirmation.**
- On confirmation, **create a new mapping version** carrying the new
  calculation policy. The batch records the `mapping_version_id` and
  `calculation_policy` snapshot actually used, so prior imports remain valid
  under their old policy.

## 5. Preview before commit (always)
Every import shows, before commit:
- **Existing mapping used** (profile + version number)
- **New columns detected** (and which are ignored vs. mapped)
- **Ignored columns**
- **Missing required fields** (block if any — see `IMPORT-COMPATIBILITY.md`)
- **Validation errors** (and warnings)
- **Duplicate rows / invoices**
- **Calculation policy used** (with any change flagged per §4)
- **Expected SLA actual sample** (resolved `sla_actual_value` on sample rows)

---

## Decision flow (summary)
```
upload → load default mapping version
      → diff headers:
           extra cols      → preview "New unmapped columns" (ignore/map/new version) [never blocks]
           renamed cols    → fuzzy suggest + confidence (auto-map high / confirm low) → new version if changed
           policy drift    → warn + require confirm → new version
      → same agent+month?  → MVP: Replace/Supersede (old → superseded, raw kept)
                              opt: Append new rows via dedupe key/hash
      → PREVIEW (mapping, new/ignored cols, missing required, errors, dups, policy, SLA sample)
      → user confirms → commit to sales_fact
```

New mapping versions only ever affect **future** imports; historical batches keep
the version + policy they were imported with.
