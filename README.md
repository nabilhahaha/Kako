# Near Expiry Registration System — v3.0

Bilingual (Arabic + English) mobile-first React app for tracking near-expiry
FMCG items across Roshen KSA's distribution network. 3-tier approval workflow:
**Salesman → Trade Marketing → Roshen Manager**.

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions)
- **Excel parsing:** SheetJS (xlsx)
- **Email:** Resend API via Supabase Edge Function
- **Deploy:** Vercel

See [`SPEC.md`](./SPEC.md) for the full functional specification.

---

## Quick start (local dev)

```bash
cp .env.example .env.local       # then fill in your VITE_SUPABASE_URL and key
npm install
npm run dev                       # http://localhost:5173
```

### Required env vars

| Variable | Where |
|---|---|
| `VITE_SUPABASE_URL` | `.env.local` + Vercel project |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` + Vercel project |

Never commit the service-role key — only the publishable (anon) key is safe to ship.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                React (mobile-first, Arabic-first)       │
│  Pages: Login, Salesman, Trade Marketing, RM           │
│  Auth: supabase.auth (email + password)                │
│  Data: src/lib/db.js → Supabase JS SDK                 │
│  Realtime: subscriptions on submissions & agg data     │
└────────────────────────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────────────┐
│                       Supabase                          │
│  auth.users — managed by Supabase Auth                 │
│  public.profiles — role + salesman_name link           │
│  public.aggregated_data — latest Excel upload (jsonb)  │
│  public.submissions — every registration               │
│  storage submission-photos — expiry/qty JPEGs          │
│  RLS — salesman/TM/RM tier enforcement                 │
│  Edge Functions:                                       │
│    admin-create-user / update / delete / reset-pwd     │
│    send-decision-email (Resend)                        │
└────────────────────────────────────────────────────────┘
```

---

## Workflow

```
RM logs in → uploads Excel → row in aggregated_data
        ↓ (realtime broadcast)
Salesman sees customers/items → submits registration with 2 photos
        ↓ status = pending_tm
TM logs in → picks one of 4 actions:
  – no_action → closed_no_action (STOPS, no email)
  – promo_1_1 / promo_2_1 / pull_resell → pending_roshen
        ↓
RM → final action → status = approved + Edge Function fires Resend email
        ↓
Editable for 48h (RLS enforces the window). Each edit appends to edit_history
and sends another email with a "⚠️ DECISION UPDATED" subject.
        ↓
After 48h → locked (UI + RLS both refuse)
```

### The 4 actions

| Code | Arabic | English |
|---|---|---|
| `promo_1_1` | عرض 1+1 | 1+1 Promotion |
| `promo_2_1` | عرض 2+1 | 2+1 Promotion |
| `pull_resell` | سحب البضاعة وإعادة بيعها | Pull stock and resell |
| `no_action` | لا يوجد إجراء | No action |

---

## Supabase setup (one-time)

> Required environment variables for Edge Functions (set via `supabase secrets set`):
> `RESEND_API_KEY`, `FROM_EMAIL`, `TM_EMAIL`.

### 1. Apply migrations

The four numbered SQL files under `supabase/migrations/` are idempotent. Either:

- Paste each one into **Supabase Dashboard → SQL Editor** in order, OR
- Use the Supabase CLI:

```bash
supabase link --project-ref njgjrktszvogivhbplbn
supabase db push
```

Files:

| Migration | What it does |
|---|---|
| `0001_schema.sql` | `profiles`, `aggregated_data`, `submissions` + triggers |
| `0002_rls.sql` | All Row Level Security policies |
| `0003_storage.sql` | Private `submission-photos` bucket + policies |
| `0004_realtime.sql` | Adds tables to the `supabase_realtime` publication |
| `0005_seed_hint.sql` | Comment-only — explains how to promote first RM |

### 2. Deploy Edge Functions

```bash
supabase functions deploy admin-create-user
supabase functions deploy admin-update-user
supabase functions deploy admin-delete-user
supabase functions deploy admin-reset-password
supabase functions deploy send-decision-email
```

Set the email secrets:

```bash
supabase secrets set \
  RESEND_API_KEY="re_xxx" \
  FROM_EMAIL="Roshen KSA <decisions@your-domain.com>" \
  TM_EMAIL="tm@your-domain.com"
```

### 3. Bootstrap the first Roshen Manager

1. Visit the deployed app → click "Forgot password" → enter your real email — wait, that won't work yet because there's no account.
2. Easier: go to **Supabase Dashboard → Authentication → Users → Add user**, paste your email and a password, check "Auto-confirm email".
3. Then run this **one-time SQL** to grant your account the RM role:

```sql
insert into public.profiles (id, email, full_name, role)
select id, email, 'Your Name', 'roshen_manager'
from auth.users
where email = 'YOUR_EMAIL@example.com'
on conflict (id) do update set role = 'roshen_manager';
```

4. Log into the app as that user. From the **User Management** tab you can now create the TM user and all salesmen — no more SQL needed.

---

## Deploying to Vercel

```bash
# Add env vars (Production + Preview)
vercel env add VITE_SUPABASE_URL          # https://njgjrktszvogivhbplbn.supabase.co
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY   # sb_publishable_xxx

vercel --prod
```

The build command is `npm run build`, output `dist/`.

---

## Excel format

Uploaded by the RM via the **Upload data** tab. Required columns (case-insensitive variants accepted):

- **Sales Man** — salesman name (must match `profiles.salesman_name` for that user)
- **Cust Account** — customer unique ID
- **Cust Name** — customer display name
- **Item Id** — product SKU
- **Item Description** — product name
- **Inv Qty Cases** — can be negative (returns); summed per (Salesman + Customer + Item)

Only items with **Net Qty > 0** are shown.

---

## File layout

```
src/
├── App.jsx                Root: auth context + routing by role
├── main.jsx               Entry
├── index.css              Tailwind + design tokens
├── lib/
│   ├── supabase.js        Configured client
│   ├── db.js              All DB reads/writes (single boundary)
│   ├── hooks.js           Data-fetching hooks w/ realtime
│   ├── mapping.js         DB row → UI shape
│   ├── lang.js            ar + en translations
│   ├── actions.js         4 action codes
│   ├── excel.js           Parser + aggregation
│   ├── storage.js         localStorage (UI lang preference only)
│   └── utils.js           calcDays, daysColor, compressImage, …
├── pages/
│   ├── LoginPage.jsx      Email + password
│   ├── SalesmanPage.jsx   Name dropdown removed — uses profile.salesman_name
│   ├── TradeMarketingPage.jsx
│   └── RoshenManagerPage.jsx  (+ User Management tab)
└── components/
    ├── Header.jsx, LanguageToggle.jsx, StatusBadge.jsx, ActionBadge.jsx
    ├── ActionSelector.jsx, DecisionStepper.jsx, EditCountdown.jsx
    ├── SubmissionCard.jsx, SubmissionDetail.jsx, MySubmissionsTracker.jsx
    ├── PhotoViewer.jsx     (loads signed URLs from Storage)
    └── UserManagementPanel.jsx   (RM only)

supabase/
├── migrations/  0001…0005   Idempotent schema + RLS + storage + realtime
└── functions/
    ├── _shared/             cors.ts, auth.ts helpers
    ├── admin-create-user/
    ├── admin-update-user/
    ├── admin-delete-user/
    ├── admin-reset-password/
    └── send-decision-email/  (Resend)
```

---

## What got removed in v3.0

| Was | Now |
|---|---|
| Role + shared password (`rep123`, `tm123`, `rm123`) | Supabase Auth email + password |
| Submissions in `localStorage` | `public.submissions` + RLS |
| Aggregated Excel in `localStorage` | `public.aggregated_data` (jsonb) |
| Photos as base64 strings | Supabase Storage signed URLs |
| EmailJS via CDN, client-side config | Resend via Edge Function, secrets server-side |
| Per-device data | Realtime cross-device sync |

The only piece of `localStorage` that remains is `nex_lang` — the user's UI language preference.

---

## License

Proprietary — Roshen KSA × Relia Distribution.
