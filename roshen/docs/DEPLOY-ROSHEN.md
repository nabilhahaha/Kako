# Deploying the Roshen Next.js app (preview/prod)

The repo root is the legacy Vite "Trade Spend" app; the Roshen platform lives in
**`roshen/`** (Next.js 16). Deploy it as its **own project** with Root
Directory = `roshen`.

> Note: the Claude build sandbox has **no outbound network to Vercel/Netlify**
> (blocked by the environment's network policy), so the project must be created
> from your Vercel account or from a machine with normal internet access. The
> app builds cleanly locally (`cd roshen && npm run build`).

## Option A — Vercel dashboard (recommended, ~2 min)
1. Vercel → **Add New → Project** → import repo `nabilhahaha/kako`.
2. **Project name:** `roshen-ksa-platform`
3. **Root Directory:** `roshen`  ← critical
4. **Framework Preset:** Next.js · **Build:** `npm run build` · **Install:** `npm install` · **Output:** default
5. **Environment Variables:**
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://wrkugzssuoxneftzappa.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_00A8lWi4_A3HC5tjlRJw0w_rRlLzlrA`
6. **Deploy.** The URL will be `https://roshen-ksa-platform.vercel.app` (+ per-PR previews).

(`roshen/.env.production` already contains these public values, so the build
works even before you add the dashboard env vars.)

## Option B — Vercel CLI (from any machine with internet)
```bash
cd roshen
npm i -g vercel
vercel link            # create/link project "roshen-ksa-platform"
# set Root Directory to roshen if prompted (or it auto-detects since you're in roshen/)
vercel env add NEXT_PUBLIC_SUPABASE_URL            # https://wrkugzssuoxneftzappa.supabase.co
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY # sb_publishable_00A8lWi4_A3HC5tjlRJw0w_rRlLzlrA
vercel --prod
```

## Expected result
The deployed URL opens **Roshen KSA Platform** → `/login` → role-aware shell →
Organization. Test users (password `Roshen#2026`):
`admin@roshen.test` (edit), `manager@roshen.test`, `area@roshen.test`.

## Why not Netlify
Netlify's Next runtime failed to build this Next.js 16 app on the
`kako-fieldsync` project, and its build logs aren't reachable from the sandbox.
Vercel is the native Next.js host and the reliable target here.
