# DEPLOYMENT

This app is a standard Next.js 15 project and deploys to Vercel (or any Node host) with no
special configuration. It runs out-of-the-box on the dependency-free file store; set the
Supabase env vars to switch to a managed database.

> **Note on this environment.** The build/QA sandbox has **no Vercel token and no configured git
> remote**, and the Vercel/Supabase integrations are disconnected. So the branch, commit, push,
> PR, and Vercel deploy that require your accounts **could not be executed from here**. Everything
> below is verified-ready; run the commands with your own credentials to finish. No URLs are
> fabricated in this report.

---

## 1. Prerequisites
- Node 18.18+ (built and tested on Node 22)
- A GitHub repository (for CI/PR)
- A Vercel account/project (for hosting)

## 2. Push the branch & open the PR
```bash
# from the repo root, on branch feature/final-production
git remote add origin <YOUR_REPO_URL>          # if no remote is configured
git push -u origin feature/final-production

# open a DRAFT PR (GitHub CLI)
gh pr create --draft --base main --head feature/final-production \
  --title "Production-ready SalesBook" \
  --body "Production hardening: DB/storage/auth abstractions, Supabase prep, code-splitting, error boundaries, a11y, full QA. See PROJECT_STATUS.md and TEST_REPORT.md."
```

## 3. Deploy to Vercel

### Option A — Vercel Git integration (recommended)
1. In Vercel, **Add New → Project** and import the GitHub repo.
2. Framework preset: **Next.js** (auto-detected). Build `next build`, output handled automatically.
3. Add environment variables (section 4) if using Supabase; otherwise none are required.
4. Every push to `feature/final-production` produces a **Preview** deployment; merging to `main`
   produces the **Production** deployment.

### Option B — Vercel CLI
```bash
npm i -g vercel
vercel login
vercel            # first run links/creates the project → Preview URL
vercel --prod     # Production URL
```
The CLI prints the Preview and Production URLs on completion.

## 4. Environment variables
None are required for the default file-store demo. For a managed backend (`.env.example`):

| Variable | When | Purpose |
|---|---|---|
| `DATA_BACKEND` | `supabase` to use Postgres | selects persistence adapter |
| `STORAGE_BACKEND` | `supabase`/`s3` for real uploads | selects file storage |
| `AUTH_PROVIDER` | `supabase` for real auth | selects auth provider |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase backends | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client Supabase use | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server persistence/storage | service-role key (server only) |
| `SUPABASE_STORAGE_BUCKET` | Supabase Storage | bucket name (default `salesbook`) |

> `data/store.json` (file store) is **gitignored** and ephemeral. On Vercel's read-only/serverless
> filesystem the file store degrades to in-memory per instance — set `DATA_BACKEND=supabase` for
> durable multi-instance persistence in production.

## 5. Provision Supabase (optional, for durable backend)
```bash
# 1. create a project at supabase.com, then apply the schema:
psql "$SUPABASE_DB_URL" -f supabase/schema.sql        # or paste into the SQL editor
# 2. set DATA_BACKEND=supabase + the NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY vars
# 3. redeploy
```

## 6. Local run
```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm run start   # production
```

## 7. Post-deploy smoke test
```bash
BASE=<your-deployment-url>
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/bootstrap        # expect 200
curl -s -X POST $BASE/api/requests/r1 -H 'content-type: application/json' -d '{"action":"approve"}'
```
Then load `$BASE`, sign in (any phone/password), and walk the checklist in TEST_REPORT.md.
