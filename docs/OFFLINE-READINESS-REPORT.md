# Offline Edition — Readiness Report

**Status:** logic phases complete and verified on real PostgreSQL; OS-bound
phases scaffolded and ready to build on macOS/Windows.

One shared codebase, one migration chain. Everything offline is gated by
`KAKO_OFFLINE`; the cloud build/tests are unaffected (PR #123 stays green).

## Phase status

| Phase | Scope | Status | Verified by |
|---|---|---|---|
| **P0** | Shared offline core (mode/paths/ports, edition descriptors, DB lifecycle, migration runner, seed, `0174`) | ✅ Done | typecheck · build · unit · integration · **offline runtime verification** (real PG boot → migrate-to-head → seed → RLS round-trip → bcrypt) |
| **P1** | macOS Tauri spike (Apple Silicon first) | 🟡 Scaffolded | `src-tauri/*`, sidecar supervisor, fingerprint, gateway scripts — **build on the Mac** (see MAC-BUILD-STEPS) |
| **P2** | Windows spike | 🟡 Scaffolded | `src-tauri` x64 path, `windows/fetch-binaries.ps1` — build on Windows |
| **P3** | Local auth (credential → Supabase-shaped JWT → RLS) | ✅ Done | unit (jwt) + **integration**: login → JWT → `erp_user_company_id()`/RLS, wrong-pw/inactive refused, reset, tenant isolation |
| **P4** | Offline licensing (sign/verify, edition + terminal cap, transfer/upgrade) | ✅ Done | 26 unit tests; cap proven at 1 **and** N; issuer↔verifier agreement |
| **P5** | Backup/restore hardening (physical `pg_dump`, restore, scheduler, retention, off-machine) | ✅ Done | scheduler unit; backup→loss→restore smoke on real PG |
| **P5C** | Recovery Certification | ✅ **CERTIFIED** | `OFFLINE-RECOVERY-CERTIFICATION.md` — all 7 checks matched after total data loss |
| **P6** | Installer / packaging (sign, notarize, SmartScreen) | 🟡 Scaffolded | `scripts/release/{mac.sh,windows.ps1}`, `offline-release.yml` (OS×edition) — run on hardware |
| **P7** | Updates / rollback | 🟡 Planned/scaffolded | Tauri signed updater stub in `tauri.conf.json`; pre-update backup + rollback reuse P5 |

## Architecture (as built)

```
Tauri shell (src-tauri/main.rs)
  ├─ sidecar: PostgreSQL 17        (127.0.0.1, private data dir)   ← scripts/offline/db.mjs
  ├─ sidecar: PostgREST            (/rest + /rpc the app already uses)
  └─ sidecar: Node Next.js server  (the app UI + thin /auth gateway)
```

- **Data layer unchanged offline:** PostgREST + a local **HS256 JWT** (Supabase
  claim shape) means `supabase-js` `.from()/.rpc()` and **RLS/`auth.uid()`** work
  exactly as in the cloud. No data-layer rewrite.
- **One migration chain:** the offline migration runner replays the same
  `supabase/migrations/*.sql` (plus the CI bootstrap + legacy base), tracked in
  `kako_schema_migrations`, idempotent.
- **Edition abstraction:** `KAKO_EDITION` selects a descriptor
  (retail/pharmacy/restaurant/fmcg → brand, business_type, productCode, assets);
  a no-core-fork test forbids edition literals leaking into the core.

## What runs today (verified in this environment)

- `npm run offline:bootstrap` — initdb → migrate-to-head (172) → seed (company +
  HQ branch + warehouse + admin + local credential).
- `npm run offline:verify` — throwaway-cluster runtime gate → **PASSED**.
- `npm run offline:backup` / `offline:restore` — physical DR backup + restore.
- `npm run offline:cert` — recovery certification → **CERTIFIED**.
- Full suites: typecheck ✅ · build ✅ · unit **742 passed** ✅ · integration
  **29 passed** incl. schema-health ✅.

## Pending (requires target hardware — by design)

- Compile the Tauri shell + bundle the per-arch sidecars (PG17/PostgREST/Node).
- Wire the runtime `/auth/v1` + `/rest/v1` proxy + the login UI/session cookie
  (P1 runtime; the auth core is already integration-verified).
- Sign + notarize (macOS) / code-sign (Windows); run the on-hardware recovery
  certification on macOS ASi + Windows (the script is OS-agnostic).

## Known limitations / notes

- Local PostgreSQL here is **16** (container); the offline target bundles **17**.
  The migration/seed/runtime logic is version-agnostic and verified on 16; final
  certification re-runs on bundled 17 during P1.
- The recovery certification here is the **logic** certification (Linux); the
  **on-hardware** macOS/Windows runs are part of P1/P2 and use the same script.
- Multi-terminal/upgrades are designed-in but v1 issues/enforces a single seat.
