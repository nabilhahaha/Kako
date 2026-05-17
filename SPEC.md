# Near Expiry Registration System — SPEC v3.0
Roshen KSA × Relia Distribution

## Overview

Mobile-first bilingual (Arabic + English) React app for tracking near-expiry
FMCG items. 3-tier workflow: **Salesman → Trade Marketing → Roshen Manager**.

## Stack
- React 18 + Vite + Tailwind CSS
- Supabase: Postgres + Auth + Storage + Realtime + Edge Functions
- SheetJS (xlsx) for Excel parsing
- Resend API for transactional emails (via Edge Function)
- Vercel for hosting

All business data on Supabase. The only `localStorage` key remaining is
`nex_lang` (UI language preference).

## Roles & auth
Authentication is Supabase Auth (email + password). The Roshen Manager
provisions all users via the **User Management** screen — no shared passwords.

| Role (`profiles.role`) | Capabilities |
|---|---|
| `salesman` | Register near-expiry items, suggest action, track own submissions |
| `trade_marketing` | Review submissions; pick action or close with `no_action` |
| `roshen_manager` | Upload Excel; final decision + email; edit within 48h; manage users |

Salesmen are linked to an Excel name via `profiles.salesman_name`.

## 4 Actions
- `promo_1_1` — 1+1 / عرض 1+1
- `promo_2_1` — 2+1 / عرض 2+1
- `pull_resell` — Pull & resell / سحب البضاعة وإعادة بيعها
- `no_action` — No action / لا يوجد إجراء  *(closes at TM stage)*

## Status Flow
```
Salesman submits with advisory suggestion
   → status = pending_tm
TM picks action:
   no_action → closed_no_action  (STOPS, no email)
   others    → pending_roshen
RM picks final action → approved + Resend email sent
   → editable for 48h (each edit appends to edit_history + sends new email)
   → after 48h: locked by RLS
```

## Excel Data
Columns (case-insensitive variants accepted):
`Sales Man`, `Cust Account`, `Cust Name`, `Item Id`, `Item Description`,
`Inv Qty Cases`.

Net Qty = SUM(`Inv Qty Cases`) per (Salesman + Customer + Item).
Only items where Net Qty > 0 are shown.

The latest aggregated structure lives in a single row of
`public.aggregated_data` (jsonb).

## Database schema
See `supabase/migrations/0001_schema.sql`:
- `profiles (id, email, full_name, role, salesman_name, is_active, …)`
- `aggregated_data (id, data jsonb, uploaded_by, salesmen_count, …)`
- `submissions (id, salesman_id, cust_*, item_*, status, photo_*_path, …, edit_history jsonb)`

## RLS
See `supabase/migrations/0002_rls.sql`:
- Profiles: authed read; self-update only. Admin Edge Functions handle insert/delete.
- Aggregated data: authed read; insert only by `roshen_manager`.
- Submissions: salesman sees own; TM/RM see all. Inserts only by salesman.
  TM updates rows in `pending_tm`. RM updates rows in `pending_roshen` or
  `approved` within 48h of `rm_decision_date`.

## Storage
Private bucket `submission-photos`. Path: `{submission_id}/expiry.jpg` and
`{submission_id}/qty.jpg`. Read via signed URLs (1 hour TTL).

## Edge Functions
Located under `supabase/functions/`:
- `admin-create-user` — RM-only; creates auth user + profile row in one shot
- `admin-update-user` — RM-only; updates profile fields and/or email
- `admin-delete-user` — RM-only; hard-deletes auth user (cascade)
- `admin-reset-password` — RM-only; sets a new password for any user
- `send-decision-email` — authed; queries DB, builds bilingual email, sends via Resend

Required Edge Function secrets:
- `RESEND_API_KEY` — Resend API key
- `FROM_EMAIL`     — verified sender (e.g. "Roshen KSA <decisions@example.com>")
- `TM_EMAIL`       — recipient (Trade Marketing inbox)

## Realtime
`supabase_realtime` publication includes `submissions` and `aggregated_data`.
The React app subscribes to both and refetches on any change — the salesman's
mobile sees Excel uploads instantly, and the RM sees new submissions land.

## Bilingual UI
All user-facing strings live in `src/lib/lang.js`. Toggle button in every
header. `<html dir>` and `<html lang>` are updated on change. Preference
persisted to `localStorage[nex_lang]`.

## 48-hour edit window
Enforced on the client (UI hides the Edit button after 48h) AND on the
database (RLS policy: `rm_decision_date > now() - interval '48 hours'`).
Each edit appends an entry to `edit_history` and triggers a new email with a
"⚠️ DECISION UPDATED — was X, now Y" subject.

## Removed since v2.0
- Shared role passwords → Supabase Auth
- localStorage data → Supabase tables
- Base64 photo blobs → Supabase Storage
- EmailJS client config → Resend Edge Function + secrets
