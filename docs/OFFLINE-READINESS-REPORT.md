# Offline Edition — FINAL Readiness Report

**Status:** all phases P0–P7 implemented. Logic + app wiring verified on real
PostgreSQL in CI; OS-bound build/sign/notarize steps are scaffolded and ready to
run on macOS/Windows.

One shared codebase, one migration chain. Everything offline is gated by
`KAKO_OFFLINE`; the cloud build/tests are unaffected (PR #123 stays green).

## Phase status (final)

| Phase | Scope | Status | Verified by |
|---|---|---|---|
| **P0** | Shared offline core (mode/paths/ports, edition descriptors, DB lifecycle, migration runner, seed, `0174`) | ✅ Done | offline runtime verification (real PG: boot → migrate-to-head → seed → RLS → bcrypt) |
| **P1** | macOS shell + **app runtime wiring** | ✅ Wiring done · 🟡 native build on Mac | GoTrue + PostgREST proxy routes build + unit-tested; `src-tauri/*` builds on the Mac |
| **P2** | Windows shell + runtime wiring | ✅ Wiring done (shared) · 🟡 native build on Win | same routes; `windows/fetch-binaries.ps1` + NSIS bundle |
| **P3** | Local auth (credential → Supabase-shaped JWT → RLS) | ✅ Done | integration: login → JWT → RLS, wrong-pw/inactive refused, reset, tenant isolation |
| **P4** | Offline licensing | ✅ Done | 26 unit tests; cap at 1 **and** N; issuer↔verifier agreement |
| **P5** | Backup/restore hardening | ✅ Done | scheduler unit; backup→loss→restore on real PG |
| **P5C** | Recovery Certification | ✅ **CERTIFIED** | `OFFLINE-RECOVERY-CERTIFICATION.md` — 7/7 after total data loss |
| **P6** | Installer / packaging (sign, notarize, SmartScreen) | 🟡 Prepared | `scripts/release/{mac.sh,windows.ps1}`, `offline-release.yml` (OS×edition) — run on hardware |
| **P7** | Updates / rollback | ✅ DB side done · 🟡 updater on hardware | `update.mjs` (pre-backup→migrate→health→auto-rollback) + `rollback.mjs` verified on real PG |

## What "runtime wiring done" means (P1/P2)

The app now speaks both protocols supabase-js expects, from the local origin —
so the **same** pages, server actions, RPCs and RLS run offline with no rewrite:

- `POST /auth/v1/token` (password + refresh), `GET /auth/v1/user`,
  `POST /auth/v1/logout` — GoTrue-shaped, backed by the local issuer.
- `/rest/v1/[...path]` — reverse-proxy to the bundled PostgREST sidecar.
- `GET /api/health` — supervisor health gate.
- `/activate` — offline license activation gate (reads the Tauri fingerprint).

All routes `404` on the cloud build. Offline packaging sets
`NEXT_PUBLIC_SUPABASE_URL` to the local app origin so supabase-js targets them.

## Architecture (as built)

```
Tauri shell (src-tauri/main.rs)
  ├─ sidecar: PostgreSQL 17        (127.0.0.1, private data dir)   ← scripts/offline/db.mjs
  ├─ sidecar: PostgREST            (/rest + /rpc the app already uses)
  └─ sidecar: Node Next.js server  (app UI + /auth/v1 + /rest/v1 gateway)
```

## What runs today (verified in CI on real PostgreSQL)

- `offline:bootstrap` · `offline:verify` (PASSED) · `offline:backup`/`restore`
- `offline:update`/`rollback` (verified) · `offline:cert` (CERTIFIED)
- typecheck ✅ · build ✅ (offline routes registered) · unit **745 passed** ·
  integration **29 passed** incl. schema-health (chain 172).

## Pending (requires target hardware — by design)

- Compile `src-tauri` + bundle per-arch sidecars (PG17/PostgREST/Node).
- Sign + notarize (macOS) / code-sign (Windows); enable the Tauri updater with
  generated keys (see DMG/EXE build guides).
- Re-run `offline:cert` natively on macOS ASi + Windows (same script).

## Known limitations

- CI PostgreSQL is **16** (container); the bundle ships **17**. Migration/seed/
  runtime logic is version-agnostic and verified on 16; final cert re-runs on 17.
- The GoTrue/PostgREST handshake is unit + build verified here; the full
  end-to-end supabase-js handshake is exercised on the Mac (needs PostgREST).
- Multi-terminal/upgrades designed-in; v1 issues/enforces a single seat.
