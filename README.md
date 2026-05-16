# FieldSync

Mobile-first field sales platform for Roshen FMCG, distributed by Relia in Saudi Arabia.

React + TypeScript + Vite + Tailwind + Supabase.

## Development

```bash
npm install
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` (see `.env.example`).

## Database setup

Apply migrations once in **Supabase Dashboard → SQL Editor**, in order:

- `supabase/migrations/0001_visit_reasons_and_buckets.sql` — adds the
  `visit_reasons` join table, the `visit-photos` and `near-expiry-photos`
  storage buckets, and registers `public.visits` with the
  `supabase_realtime` publication (which is what the supervisor live map
  uses for push updates — this is the same effect as enabling Replication
  for the `visits` table in Dashboard → Database → Replication, so no
  extra UI step is needed).

Migrations are idempotent — re-running is safe.
