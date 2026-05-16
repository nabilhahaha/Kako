# Deploying FieldSync to Vercel

End-to-end guide for taking the app from a fresh Vercel account to a
production URL serving real users. Reading time ~10 minutes;
deployment time ~15 minutes.

---

## Prerequisites

- A Vercel account (free tier is enough for staging; Pro recommended
  for production)
- A Supabase project (Pro tier recommended for production — gives you
  daily backups, longer log retention, and faster connection pooling)
- Production-ready Supabase credentials:
  - Project URL (`https://<project-ref>.supabase.co`)
  - Publishable key (Project Settings → API → `anon` / publishable)
- Custom domain (optional, but recommended — `fieldsync.example.com`)

---

## 1. Apply database migrations

Before the first deploy, apply the three migrations in order via the
Supabase Dashboard:

1. Open **Supabase Dashboard → SQL Editor → New query**
2. Paste the contents of `supabase/migrations/0001_visit_reasons_and_buckets.sql`
   and click **Run**. Confirm in the response that the statements executed.
3. Repeat for `0002_promotions.sql` and `0003_audit_logs.sql`.

Verify each migration applied:

```sql
-- Should return one row each
SELECT 1 FROM public.visit_reasons LIMIT 1;       -- empty is fine
SELECT 1 FROM public.promotions LIMIT 1;          -- empty is fine
SELECT 1 FROM public.audit_logs LIMIT 1;          -- empty is fine
SELECT id FROM storage.buckets WHERE id IN ('visit-photos', 'near-expiry-photos');
-- Should return 2 rows
SELECT 1 FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'visits';
-- Should return 1 row
```

If any check fails, re-run the relevant migration — they're all
idempotent.

---

## 2. Connect the repo to Vercel

### Option A — Vercel dashboard (recommended for the first deploy)

1. **Vercel Dashboard → Add New → Project**
2. Select the GitHub repository (`nabilhahaha/kako` or your fork)
3. **Framework Preset:** Vite (auto-detected)
4. **Build Command:** `npm run build` (default)
5. **Output Directory:** `dist` (default)
6. **Install Command:** `npm ci` (default)

Don't click Deploy yet — set env vars first (step 3).

### Option B — Vercel CLI (for repeat deploys)

```bash
npm i -g vercel
vercel login
vercel link        # link the local repo to a Vercel project
vercel             # preview deploy
vercel --prod      # production deploy
```

---

## 3. Environment variables

Set these in **Vercel Project → Settings → Environment Variables**.
Apply them to **Production**, **Preview**, and **Development**
(separate values per environment if you have a staging Supabase
project — recommended).

| Name | Example | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://abcdefg.supabase.co` | Production Supabase URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | Publishable key only — never the service-role key |

**Important:** the `.env` file in the repo contains development values
and is committed for convenience. Vercel's dashboard values take
precedence at build time, so committed values don't leak to
production.

After adding env vars, trigger a redeploy (Vercel does this
automatically the next time the branch is pushed, or you can hit
**Redeploy** on the latest deployment).

---

## 4. Custom domain

1. **Vercel Project → Settings → Domains → Add**
2. Enter your domain (e.g., `fieldsync.example.com`)
3. Vercel shows you the DNS record to add:
   - **CNAME** record pointing to `cname.vercel-dns.com`, or
   - **A** record pointing to Vercel's IPs (shown in the UI)
4. Add the record at your DNS provider (Cloudflare, Route53,
   GoDaddy, etc.)
5. Wait for DNS propagation (usually <5 min, can be up to 24 h)
6. Vercel auto-provisions an SSL certificate via Let's Encrypt

### Supabase auth redirect URLs

If your app uses any Supabase auth flow that returns to the app
(password reset, magic link, OAuth), add your production domain to
**Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL:** `https://fieldsync.example.com`
- **Redirect URLs:** add `https://fieldsync.example.com/*`

Without this, magic links from production will redirect to localhost.

---

## 5. Production migration checklist

Before promoting a build to production, verify each item:

- [ ] All three migrations applied (see verification queries in §1)
- [ ] Storage buckets `visit-photos` and `near-expiry-photos` exist
      and are marked public
- [ ] `visits` table is in the `supabase_realtime` publication
- [ ] Production env vars set in Vercel
- [ ] Production domain added to Supabase Auth → URL Configuration
- [ ] At least one user exists in `public.users` with role
      `admin_relia` (you can promote yourself via SQL Editor:
      `UPDATE public.users SET role = 'admin_relia' WHERE email = 'you@example.com';`)
- [ ] CI is green on the commit being deployed
- [ ] No `console.log` / `console.warn` of secrets in the build output

---

## 6. Post-deployment verification

Walk through each role end-to-end on the production URL. Have one
test account per role:

### Salesman path
- [ ] Sign in as a presales rep → lands on `/salesman`
- [ ] KPIs render (or "no data" if the rep has no visits yet)
- [ ] Customers list loads; click one → 360 loads
- [ ] Start a visit wizard, deny GPS once → error message is clear
- [ ] Re-try, allow GPS → wizard proceeds
- [ ] Upload a photo → preview appears
- [ ] Submit visit → toast appears; redirected to history
- [ ] Photo is visible in `visit-photos` storage bucket
- [ ] Near-expiry registration submits and shows in supervisor queue

### Supervisor path
- [ ] Sign in as supervisor → team dashboard renders
- [ ] `/supervisor/map` loads Leaflet without console errors
- [ ] Submit a visit as the rep in another tab → marker appears on
      the supervisor's map within ~2 s (realtime working)
- [ ] Approve a pending visit → it disappears from the queue
- [ ] Create a financial request with 1-min TTL → countdown ticks,
      flips to expired

### Regional / Trade marketing / Executive
- [ ] Charts render without "ResizeObserver loop" warnings
- [ ] Executive auto-refresh fires after 5 minutes (check
      `lastUpdate` timestamp in the header)
- [ ] PowerPoint export downloads a non-zero-byte `.pptx` file
- [ ] Open the file — title, KPI grid, and trend chart all render

### Admin
- [ ] User list paginates correctly (test page 2 if you have >50 users)
- [ ] Edit a user's role → audit log gets a new entry
- [ ] Raw-data upload: drag in a `.xlsx` → preview shows first 10 rows
- [ ] Column mapper auto-maps recognizable headers
- [ ] Save mapping → check `raw_data_mappings` table for the rows

### Cross-cutting
- [ ] Test on a real mobile device at 375px (iPhone SE width)
- [ ] RTL: confirm icons, padding, and chevrons mirror correctly
- [ ] Log out → redirected to `/login`; refreshing while logged in
      keeps the session

---

## 7. Monitoring (post-launch)

Recommended setup once you have real users:

| Concern | Tool |
|---|---|
| Frontend errors | Sentry (`@sentry/react`) — capture and group exceptions, sourcemap upload from Vercel |
| Performance | Vercel Speed Insights (one click in dashboard) |
| User analytics | PostHog or Plausible — privacy-friendly, RTL UI |
| Uptime | Better Stack / Pingdom — ping the login page every 60 s |
| Database | Supabase Dashboard → Reports — watch p95 query time and CPU |
| Supabase logs | Logflare/Supabase Logs — alert on >5 % error rate |

---

## 8. Rollback

If a deployment misbehaves:

1. **Vercel Dashboard → Deployments**
2. Find the last known-good deployment
3. Click the menu → **Promote to Production**

Database migrations are forward-only. If a migration causes a
problem, write a corrective migration (`NNNN_revert_X.sql`) and apply
it the same way. Never edit existing migration files after they've
been applied to production — that's how schema drift starts.

---

## 9. Future hardening

These are out of scope for v1.0 but on the roadmap:

- **Edge Functions** for admin user creation (so admins don't need
  Supabase Dashboard access) and raw-data ingestion (so the upload
  page can actually import rows, not just save the mapping)
- **CSP headers** via `vercel.json` to block third-party script
  injection (allow `cdn.jsdelivr.net`, Google Fonts, your Supabase
  URL only)
- **Vitest + Playwright** test suites; wire into CI before deploys
  promote to production
- **`v_regional_performance` and other views** to push analytics
  aggregations server-side once visit count exceeds ~10 k
- **Route-level code splitting** with `React.lazy` for the admin and
  executive routes (rarely visited, currently in the main chunk)

---

## Help

If you hit something not covered here, the entry points are:

- **Build/CI issues:** look at `.github/workflows/ci.yml` and the
  most recent Actions run
- **Routing/auth:** start in `src/App.tsx` and follow the guards
- **Schema mismatch:** the queries are in `src/hooks/*.ts`, one file
  per feature
- **Realtime:** `src/hooks/useLiveMap.ts` and migration 0001
