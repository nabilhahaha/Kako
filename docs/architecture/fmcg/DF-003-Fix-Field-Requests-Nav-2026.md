# DF-003 — Fix: Discoverable "Field Requests" Navigation Entry

In-pilot, **navigation-only** fix that restores discoverable access to the existing
Requests Hub for the salesman. No workflow, schema, permission, or architecture change.
Applied to the official target environment **vantora-staging**.

---

## Problem (runtime-confirmed)

The Requests Hub (`/field/van-sales/requests`) exists, is functional, and returns 200, but
the deployed UI exposed **no user-accessible navigation path** to it. The only "Requests"-style
item the salesman saw was **"Change Requests"** (`/change-requests`) — a different, list-only
module. The Hub was reachable only by typing the URL.

## Fix

1. **Visible navigation entry** added in `src/lib/erp/navigation.ts`:
   ```
   { label: 'nav.items.fieldRequests', href: '/field/van-sales/requests', icon: Inbox,
     perm: 'field.sales', flag: 'platform.salesman_requests' }
   ```
   - Renders in the **desktop sidebar** and the **mobile "More"** drawer (which renders the
     sidebar) — exactly where only "Change Requests" appeared before.
   - Gated `field.sales` + flag `platform.salesman_requests`, mirroring the Hub's own page
     guard, so it never appears as a URL-only orphan when the capability is off.

2. **Clear distinction Requests vs Change Requests** (i18n, both locales):
   - New: **"Field Requests"** / **"الطلبات الميدانية"** → `/field/van-sales/requests`
   - Existing: "Change Requests" / "طلبات التعديل" → `/change-requests`
   - Different routes, different labels — no collision.

## Scope honored

- Navigation-only: **one** nav item + **one** i18n key (en + ar). The Hub, its forms, server
  actions, RPCs, permissions, and policies are unchanged.
- The Hub already exists and works — this restores access to an existing workflow.

## Validation

- `tsc --noEmit`: clean.
- Tests: **47/47** pass (i18n parity + navigation profiles).
- Resolution check: the new item passes `visibleSections` for the salesman profile
  (`field.sales` ✓ + `platform.salesman_requests` ON ✓) → appears in mobile "More".

## Deployment

- Commit `6e9b458` pushed to `claude/fmcg-sell-collect-loop` → preview redeploying on the
  **vantora-staging**-connected deployment.
- **Updated link (serves the fix once the build is Ready):**
  `https://kako-git-claude-fmcg-sell-collect-loop-123456789-s-projects.vercel.app/today?_vercel_share=VyNwYm9LlBd4gzUkXZyh99CSCWkGh3G5`
- Path to verify: log in as `salesman@pilot.test` / `test.123` → **More → Field Requests** →
  opens the Hub (New Customer, Update, GPS, Credit, Payment Terms, Route Transfer, Reactivate,
  Close, + Load / Cash handover / Reopen).

## Screenshot note (honest limitation)

Authenticated browser screenshots cannot be produced from this environment (no container
egress; preview is auth-protected). The runtime proof offered instead: after you tap
**More → Field Requests**, the deployment runtime logs will show the navigation hit to
`/field/van-sales/requests` originating from the nav — which I can pull on request to close
DF-003.

## Status

- **DF-003** — Navigation / Discoverability, High → **Fixed** (commit `6e9b458`), navigation-only.
- Pilot freeze preserved (no new features/workflows/architecture).
