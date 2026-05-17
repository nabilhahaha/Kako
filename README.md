# Near Expiry Registration System

Bilingual (Arabic + English) mobile-first React web app for tracking near-expiry FMCG items
across Roshen KSA's distribution network. Built on a 3-tier approval workflow:
**Salesman → Trade Marketing → Roshen Manager**.

- **Stack:** React 18 + Vite + Tailwind CSS
- **Excel parsing:** SheetJS (xlsx)
- **Email:** EmailJS (loaded from CDN on demand)
- **Storage:** `localStorage` — no backend, fully client-side
- **Deploy:** Vercel / Netlify (any static host)

See [`SPEC.md`](./SPEC.md) for the full functional specification.

## Quick start

```bash
npm install
npm run dev    # http://localhost:5173
```

## Roles & passwords

| Role | Password |
|---|---|
| Salesman | `rep123` |
| Trade Marketing | `tm123` |
| Roshen Manager | `rm123` |

## Workflow

```
Roshen Manager uploads Excel raw data
        ↓
Salesman picks his name → customer → item
        ↓
Adds physical qty, expiry date, 2 camera photos, advisory suggestion
        ↓ (pending_tm)
Trade Marketing picks one of 4 actions:
  – no_action            → closed_no_action (STOPS — no email)
  – promo_1_1 / promo_2_1 / pull_resell → pending_roshen
        ↓
Roshen Manager picks final action → approved + email sent to TM
        ↓
Editable for 48h — each edit sends a new email with a different subject
        ↓
After 48h → LOCKED
```

## The 4 actions

| Code | Arabic | English |
|---|---|---|
| `promo_1_1` | عرض 1+1 | 1+1 Promotion |
| `promo_2_1` | عرض 2+1 | 2+1 Promotion |
| `pull_resell` | سحب البضاعة وإعادة بيعها | Pull stock and resell |
| `no_action` | لا يوجد إجراء | No action |

## Excel format

Uploaded by the Roshen Manager via the "Upload data" tab.
Required columns (case-insensitive variants accepted):

- **Sales Man** — salesman name
- **Cust Account** — customer unique ID
- **Cust Name** — customer display name
- **Item Id** — product SKU
- **Item Description** — product name
- **Inv Qty Cases** — can be negative (returns); summed per (Salesman + Customer + Item)

Only items with **Net Qty > 0** are shown.

## EmailJS setup

Configure via the ⚙️ Settings modal (visible to Trade Marketing and Roshen Manager).
You'll need:

- Public Key, Service ID, Template ID (and optionally a separate Template ID for edits)
- Roshen Manager email (from)
- Trade Marketing email (to)

The template should accept these variables: `to_email`, `email_subject`, `is_edit`,
`decision_ar`, `decision_en`, `old_decision_ar`, `old_decision_en`,
`salesman_name`, `salesman_suggestion_ar`, `salesman_suggestion_en`, `salesman_notes`,
`tm_decision_ar`, `tm_decision_en`, `tm_notes`,
`customer_name`, `customer_account`, `item_description`, `item_id`,
`system_qty`, `physical_qty`, `expiry_date`, `days_remaining`,
`roshen_notes`, `submitted_at`, `decision_date`, `edit_date`.

The sample HTML template is in [`SPEC.md`](./SPEC.md).

## Storage keys (localStorage)

| Key | Purpose |
|---|---|
| `nex_lang` | `"ar"` or `"en"` |
| `nex_agg` | Aggregated salesman → customer → items tree |
| `nex_subs` | Array of submissions (no photo blobs) |
| `nex_pe_{id}` | Expiry photo (base64 JPEG) |
| `nex_pq_{id}` | Quantity photo (base64 JPEG) |
| `nex_ecfg` | EmailJS configuration |

## Deploy

```bash
npm run build
# dist/ contains the production bundle — drop it on Vercel/Netlify.
```

## License

Proprietary — Roshen KSA × Relia Distribution.
