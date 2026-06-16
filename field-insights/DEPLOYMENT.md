# Field Insights — Deployment (separate from VANTORA)

Field Insights deploys as its **own** Vercel project, fully isolated from VANTORA's `kako` / `kako-fieldsync` projects. Do **not** change those, and do **not** deploy from the repo root.

## Vercel project setup (exact values)

Create a **new** Vercel project, importing the same GitHub repo (`nabilhahaha/Kako`).

| Setting | Value |
|---|---|
| **Project name** | `field-insights` |
| **Framework preset** | Vite |
| **Root Directory** | `field-insights`  ← the critical setting |
| **Build Command** | `npm run build` |
| **Install Command** | `npm install` |
| **Output Directory** | `dist` (resolves to `field-insights/dist`) |
| **Node.js version** | 22.x |
| **Production branch** | `claude/field-insights-new-project-5w7gg9` (until merged to main) |

> With Root Directory = `field-insights`, Vercel reads `field-insights/vercel.json` (SPA rewrites + build/output) and builds only this app.

## Environment variables (Production + Preview)

| Key | Value |
|---|---|
| `VITE_FI_SUPABASE_URL` | `https://qulukfxuaklhcztchrbv.supabase.co` |
| `VITE_FI_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_ELT1I44b4KT2MLpQ1p9HOQ_GVS0qLhr` |
| `VITE_FI_APP_NAME` | `Field Insights` |

The publishable key is a public client key (safe in the browser). These are intentionally namespaced `VITE_FI_*` so they never collide with VANTORA's `VITE_SUPABASE_*`.

## Verify (after the project is created)
1. Open the new project's preview/production URL.
2. You should see the **Field Insights** sign-in screen (navy theme), not the Trade Spend Platform.
3. The page title is "Field Insights"; the app installs as a PWA.

VANTORA's `kako` and `kako-fieldsync` deployments remain unchanged.
