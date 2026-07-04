# KNOWN_ISSUES

Honest list of limitations and environment constraints as of `feature/final-production`.
None block local production; the deployment items are credential constraints, not defects.

## Environment / delivery constraints (this sandbox)
1. **No remote push / PR executed.** The workspace has no configured git remote and no
   GitHub token, so the branch was created and committed locally but **not pushed**, and **no PR
   was opened**. Commands to do so are in DEPLOYMENT.md §2.
2. **No Vercel deploy / URLs.** No `VERCEL_TOKEN` and the Vercel integration is disconnected, so
   the app was **not deployed** and there are **no Production/Preview URLs** to report. It is
   deploy-ready; see DEPLOYMENT.md §3. (URLs were deliberately not fabricated.)
3. **Google Fonts over CDN.** `globals.css` imports IBM Plex via `fonts.googleapis.com`. In this
   sandbox that request fails TLS validation and the app falls back to the system font; in a normal
   browser/deployment it loads fine. Optional hardening: self-host via `next/font` (NEXT_STEPS).

## Application limitations (by design / scope)
4. **File store is not durable on serverless.** The default `DATA_BACKEND=file` persists to
   `data/store.json`, which is per-instance and ephemeral on Vercel. Set `DATA_BACKEND=supabase`
   for durable, multi-instance persistence (adapter + schema are ready).
5. **Auth is a demo provider.** `DemoAuthProvider` accepts any non-empty credentials; there are no
   sessions/JWTs yet. `SupabaseAuthProvider` is a scaffold that throws until implemented.
6. **Supabase adapters are dependency-free stubs-with-logic.** `SupabaseStore` and
   `SupabaseStorageProvider` are implemented against the REST APIs but have **not** been exercised
   against a live Supabase project in this session.
7. **Images are placeholders.** Store/profile/gallery imagery uses striped placeholder tiles (as in
   the source design); wire real uploads through `StorageProvider`.
8. **Browser Forward does not restore forward state.** Back/Forward are wired so navigation stays
   within the SPA and Back performs an in-app back; pressing Forward re-anchors but does not replay
   a forward screen (the in-app model has no forward stack). Back — the common expectation — works.
9. **Partial ARIA on custom controls.** Many tap targets are styled `<span>`/`<div>` with `onClick`.
   Primitives (switches, nav, icons) and key states are accessible; a full pass to add
   `role="button"`/`tabindex`/keyboard to every custom control is pending (NEXT_STEPS).
10. **Data content is the sample dataset.** 5 customers and related records, bilingual. Not all
    long-form Arabic note bodies have hand-tuned English equivalents beyond what's in `seed.ts`.
11. **No automated test suite yet.** Verification is via the static gates + a headless QA harness in
    this session; unit/e2e tests (Vitest/Playwright) are a NEXT_STEPS item.
