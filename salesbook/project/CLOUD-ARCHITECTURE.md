# Roshen KSA Dashboard — Cloud Architecture
**Date:** 2026-07-08 · **Backend:** Supabase project "Roshen" (`wrkugzssuoxneftzappa`, eu… `ap-northeast-1`) · **Frontend:** `salesbook/project/Roshen_KSA_Dashboard_Promotion.html`

The dashboard is a multi-user cloud application: one centralized database, one permanent URL, one source of truth. Data changes made by an authorized user reach every connected user automatically. No production data lives in LocalStorage/IndexedDB (local storage is only a version-keyed read cache), and there is no standalone-HTML workflow.

**Single-company by design.** This dashboard serves Roshen exclusively. There is deliberately **no tenant model** — no tenant/company columns, no per-tenant policies, no tenant routing. One authentication system (the Roshen Supabase project's `auth.users`), one role table, one active dataset. The isolation into `dash_*` tables exists for maintainability (clean separation from the platform app), not for multi-tenancy.

## 1 · Backend (isolated `dash_*` namespace)

Everything lives in its own tables inside the existing Roshen Supabase project, coupled to the platform **only via `auth.users`** (shared logins). No foreign keys touch platform tables, so the dashboard backend is independently maintainable and can be moved to a dedicated project with `pg_dump -t 'public.dash_*'` plus the storage bucket.

| Object | Purpose |
|--------|---------|
| `dash_users` | Dashboard role per auth user: `super_admin` / `admin` / `manager` / `viewer` |
| `dash_versions` | **Immutable** dataset versions: storage path, import mode, row/added/updated/removed counts, size, checksum, `stats` snapshot (rows, net sales, months, entities) for instant compare, parent version, author |
| `dash_state` | Singleton pointer to the **active** version — the realtime signal |
| `dash_audit_log` | Every change: user, timestamp, action (seed / import_replace / import_merge / import_append / rollback / role_change), file, counts, previous-version reference |
| Storage `dash-datasets` | Private bucket of gzipped dataset JSON blobs (`versions/<uuid>.json.gz`, ~1.4 MB per 95k rows) |

**Write path (UI-agnostic API)** — all writes go through security-definer RPCs that enforce roles server-side (RLS additionally denies direct table writes and viewer storage writes):

- `dash_commit_import(path, file, mode, counts…, stats)` — registers an uploaded blob as a new version, activates it, writes the audit row. Atomic. Admin+.
- `dash_rollback(version_id)` — points `dash_state` at any previous version + audit row. Admin+.
- `dash_set_role(email, role)` — provision users / change roles. Super admin only.
- `dash_boot()` — one-round-trip boot payload: caller's role + active version.

A future React frontend drives exactly this contract; nothing in the API knows about the current UI.

## 2 · Data flow

```
Login (Supabase Auth email/password)
  → dash_boot() → role + active version
  → download blob (or version-keyed local cache) → gunzip → atomic swap → render

Import (admin):  analyze → mode dialog → merge locally → gzip → upload blob
  → dash_commit_import() → local apply
  (publish happens BEFORE success; a cloud failure rolls the local swap back,
   so no client can ever diverge from the central version)

Every other client:  realtime UPDATE on dash_state
  → fetch version row → download blob → atomic swap → full re-render
  → toast "X imported new data (version N) — dashboard refreshed automatically"
  (60-second polling fallback through the same handler when WebSockets are blocked)
```

## 3 · Roles

| Role | See data | Import / Replace / Merge | Rollback | Audit log | Manage roles |
|------|:-:|:-:|:-:|:-:|:-:|
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ | — |
| manager | ✓ | — | — | ✓ | — |
| viewer | ✓ | — | — | — | — |

Enforced twice: hidden in the UI **and** rejected by RLS/RPC on the server (verified: viewer storage upload → RLS violation; viewer commit RPC → "not authorized").

## 4 · Versioning & audit

Every import creates a new immutable version. The **Data & Versions** dialog (sidebar → Data Management) lists all versions with author/mode/file/counts/net-sales, lets admins **compare any two versions** (Δ rows, net sales, customers, SKUs, salesmen, months from the stored stats snapshots — no blob downloads needed) and **restore any version in one click**; every connected user switches automatically. The audit log tab shows the full change history.

## 5 · Automatic backups

Three independent layers:

1. **Dataset blobs are backups by design** — every import creates an immutable version in the `dash-datasets` bucket; nothing overwrites or deletes them (the bucket has no client UPDATE/DELETE policies, so deletion is denied by default). Any historical state is restorable through the normal rollback flow.
2. **Nightly metadata snapshots** — a `pg_cron` job (`dash-nightly-backup`, 02:00 UTC / 05:00 KSA) runs `dash_take_backup()`, which snapshots `dash_users`, `dash_versions`, `dash_state` and the full `dash_audit_log` as JSON into `dash_backups` (last 30 kept, ~2 KB each). Admins can also trigger `dash_take_backup('manual')` at any time and read snapshots via the API; clients cannot write or delete them.
3. **Supabase project backups** — the project's daily database backups / PITR (Supabase dashboard → Database → Backups) cover the storage bucket and everything else. Worth confirming this is enabled on the project's plan.

## 6 · Deployment

The HTML file is a static asset — deploys never change the URL, and **data updates never require a redeploy** (data lives in the database, not the file).

- Every push to the PR branch auto-deploys the same stable preview URL (Netlify `deploy-preview-439--kako-fieldsync.netlify.app/roshen_dashboard.html`).
- Merging the PR promotes the identical file to the permanent production URL (`kako-fieldsync.netlify.app/roshen_dashboard.html`); a custom domain (e.g. `dashboard.<company>.com`) can be attached in the Netlify/Vercel dashboard with no app changes.
- Opened as a local `file://` (offline dev / test harness), the app falls back to the legacy embedded-data mode; `?cloud=1` forces cloud mode.

## 7 · Verified end-to-end (two concurrent browsers, live backend)

Admin boots from cloud v1 (net sales exact to the SAR) → imports merge → v2 published → **viewer auto-synced over a real websocket in seconds, no reload** (rows + totals identical, toast shown) → admin restores v1 → both clients switch automatically → viewer sees read-only dialog, no restore buttons, no audit tab; RLS blocks viewer writes. Zero console errors in both sessions. Legacy `file://` mode regression-tested.

## 8 · Operational notes

- The embedded dataset inside the HTML is now only the pre-auth scaffold + offline fallback; the cloud version always replaces it before first render. It can be stripped later to shrink the file (~11 MB) once offline mode is no longer wanted.
- Stock Report snapshots are still embedded (they have no import pipeline yet) — candidate for the same versioned-blob treatment.
- **Demo/test accounts** all share the unified test password `test.123` (per-role: `dash.super@` / `dash.admin@` / `dash.manager@` / `dash.viewer@roshen.test`, plus the platform test accounts `admin@` / `manager@roshen.test`). Real user accounts are untouched. Because the URL is publicly reachable, disable or re-rotate these demo accounts once real users are onboarded (Supabase → Authentication → Users).
- Supabase security advisors: the `dash_*` security-definer RPCs are intentionally executable by `authenticated` (they enforce roles internally) — this is the standard Supabase RPC pattern; remaining advisor warnings predate this work and belong to the platform app.
