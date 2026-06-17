# DF-003 — "Field Requests" Not Visible: Deploy & Gate Verification

Runtime + source verification after the DF-003 nav fix, when the salesman reported the
new entry still not visible. **Conclusion: code, deployment, and gates are all verified
correct — the entry is suppressed by a stale client/layout cache (same class as ENV-1b),
not a code/deploy/gate defect.**

---

## Verified facts

| Check | Result |
|---|---|
| `fieldRequests` item committed | `navigation.ts:376` (commit `6e9b458`, files: navigation.ts + core.ts) |
| In the deployed commit | `6e9b458` is an ancestor of live `e7493bb` ✓ |
| Live deployment | branch alias serves `dpl_2MLqL26W4e3Duei1H28atmupL5Lz`, `READY`, commit `e7493bb` |
| Module gate (Sales section) | OPEN — company `612af0bd` has sales, crm, analytics, field_ops, distribution, inventory, van_sales, warehousing all enabled |
| Permission gate | `field.sales` — salesman has it ✓ |
| Flag gate | `platform.salesman_requests` — resolves **true** at runtime (proven: `/field/van-sales/requests` returns 200, which the page only does when this flag is on) |
| Sidebar receives tenant flags | `sidebar.tsx:45` calls `visibleSections(..., enabledFlags)`; layout passes `enabledFlags={navFlags}` (includes tenant feature flags) |

→ With module + perm + flag all satisfied and the build deployed, the item *should*
render in the sidebar and the mobile "More" drawer.

## The 5 questions — answers

1. **Did `6e9b458` deploy to the URL?** Yes. Branch alias
   `kako-git-claude-fmcg-sell-collect-loop-…` → `dpl_2MLqL26W4e3Duei1H28atmupL5Lz`
   (commit `e7493bb`, contains `6e9b458`). Caveat: an immutable per-build URL
   (`kako-<hash>-…`) would be pinned to an older build — use the branch-alias URL.
2. **Ready & serving the new build?** Yes — `READY`, serving the branch alias, `e7493bb`.
3. **Extra permission/flag gate?** Yes, and both pass: `perm: field.sales` +
   `flag: platform.salesman_requests` (true). The gate is not what hides it.
4. **Exact label:** EN **"Field Requests"**, AR **"الطلبات الميدانية"**
   (`nav.items.fieldRequests`).
5. **Exact route/placement:** `href: /field/van-sales/requests`, **Sales** section of
   `navigation.ts` (line 376), right after "Cash Custody" → sidebar order is
   Customer Statements · Daily Summary · Cash Custody · **Field Requests**.

## Most likely cause: stale layout/Router cache

The sidebar and bottom nav are rendered in the App Router **layout**. Next.js keeps the
layout's RSC payload in the client Router Cache across soft navigations, and a CDN/browser
cache can also serve a pre-deploy layout. So a newly deployed nav entry may not appear
until a **hard reload or a cache-free session**. This is the same mechanism behind the
earlier ENV-1b "stale layout" finding.

## Definitive cache-free test

Open in a **fresh Incognito/Private window** (no Router cache), log in, then check **More**:

`https://kako-git-claude-fmcg-sell-collect-loop-123456789-s-projects.vercel.app/today?_vercel_share=VyNwYm9LlBd4gzUkXZyh99CSCWkGh3G5`

(or hard-reload the current tab: Ctrl/Cmd+Shift+R).

- **Appears in incognito** → it was client/layout caching (expected). DF-003 resolved.
- **Still absent in clean incognito** → genuine new signal; investigate the sidebar/"More"
  rendering path further. The code/deploy/gates are verified correct, so no further code
  churn until this clean-session test rules out caching.

## Status

- DF-003 fix (`6e9b458`) — code, deploy, and gates **verified correct**.
- Pending: user's clean-session (incognito/hard-refresh) result to confirm visibility.
- Freeze preserved (navigation-only; no workflow/architecture change).
