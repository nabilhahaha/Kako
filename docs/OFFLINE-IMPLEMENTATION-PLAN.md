# Offline Edition — Implementation Plan (cross‑platform, build order: macOS ASi + Windows together)

**Status:** planning only. **No code in this document.** Implement after approval, starting with **P0 + the macOS spike (P1)** because the dev/test machine is Apple Silicon; Windows (P2) proceeds in parallel.

**Build order**
1. **macOS Apple Silicon** — first, for local testing on the dev Mac.
2. **Windows 10/11 (x64)** — in parallel.
3. **macOS Intel (x86_64)** — only if feasible (arch slice; see P6/risks).

**Fixed rules:** one shared offline architecture · one shared codebase · local PostgreSQL 17 · local Next.js server · Tauri shell · local auth · backup/restore · offline license activation · no internet dependency after activation.

**Design‑ahead requirements (added at approval, must shape the architecture from P0):**
1. **Multi‑store / commercial licensing prepared from day one** — even though v1 ships single‑store, the license model, schema, and verification are designed so we can later issue licenses **per customer**, **per device**, **limit terminal count**, sell **paid upgrades**, and gate by **edition** — *without re‑architecting* (see "Licensing model — forward design" below and P4).
2. **Edition / brand separation** — the same offline core must be exportable as **VANTORA Retail**, **VANTORA Pharmacy**, **VANTORA Restaurant**, **VANTORA FMCG** by configuration only, **never** by forking the core (see "Edition & branding abstraction" below).
3. **Recovery Certification** — a dedicated certification phase after P5 (`P5C`) that proves full data‑loss recovery and emits a signed‑off report.
4. **Commercial readiness review** — before the project closes, publish sizing, capacity limits, terminal limits, and recommended selling/support models (see "Commercial Readiness Review" at the end).

---

## Edition & branding abstraction (affects P0, P4, P6)

**Goal:** one offline core; many branded editions, switched by config — no core forks.

- **Single source of edition config:** `src/lib/edition/editions.ts` (new) defines an `Edition` descriptor: `id` (`retail|pharmacy|restaurant|fmcg`), `brand` (`"VANTORA Retail"` …), `businessType` (maps to the existing module gate, e.g. `clothing` → `fashion`), `enabledModules`, `featureFlags`, `defaultSeed`, and **assets** (app name, icons, splash, accent color, receipt header defaults, license `productCode`).
- **Build‑time selection:** `KAKO_EDITION=retail|pharmacy|restaurant|fmcg` (env) chosen at package time; the Tauri bundle, app id, icons, and installer name derive from the edition descriptor. One CI matrix axis = edition.
- **Runtime behavior unchanged:** module/permission gating, nav `businessType` filtering, and RLS already exist — editions just **select** which existing modules/business_type are active. Pharmacy/Restaurant/FMCG verticals reuse the same gating mechanism the current `clothing→fashion` retail path already uses; net‑new vertical *features* are out of scope for the offline project (this phase only guarantees the **packaging/branding seam** is clean).
- **License ↔ edition binding:** the signed license carries `edition` + `productCode`; the app refuses to run an edition the license wasn't issued for (ties requirement 1 ↔ 2).
- **No core fork rule (enforced):** a lint/test (`edition.test.ts`) asserts there are **no edition‑name string literals** scattered in app code — everything reads from the edition descriptor — so a new brand is "add a descriptor + assets," not a code change.

---

## Licensing model — forward design (single‑store now, multi‑store/terminal later)

The P4 implementation ships **single‑terminal activation**, but the **license format and verifier are designed for the full commercial model now** so later steps are additive:

| Capability | v1 (shipped) | Designed‑in for later (no re‑architecture) |
|---|---|---|
| Per‑customer license | 1 customer | `customerId` claim already in the signed license |
| Per‑device activation | 1 device (fingerprint‑bound) | license holds an array of `activations[]`; verifier already device‑aware |
| Terminal/seat limit | `maxTerminals = 1` | `maxTerminals = N`; activation refused past the cap; seat transfer/deactivate |
| Paid upgrades | n/a | license `tier`/`validUntil` + a re‑issue/upgrade flow (online or air‑gapped code) |
| Edition‑based licensing | retail only | `edition` + `productCode` claims (ties to branding abstraction) |
| Multi‑store (chain) | n/a | optional `storeGroupId`; per‑store sub‑licenses under one customer |

These are **claims/fields in the signed license + checks in `verify.ts`** — present in the schema from P4 even when the enforced value is 1. This is the explicit "prepare so we can later…" requirement.

---

## Key architectural decision (affects every phase): the offline data gateway

The cloud app talks to Supabase via **supabase‑js** (`.from().select()`, `.rpc()`) and relies on **RLS + `auth.uid()`**. To stay offline **without rewriting the data layer**, the offline stack bundles:

```
[Tauri shell + tray/menu bar]
   ├─ sidecar: PostgreSQL 17        (127.0.0.1:<pgport>, private data dir)
   ├─ sidecar: PostgREST            (serves the same /rest + /rpc the app already uses)
   └─ sidecar: Next.js Node server  (127.0.0.1:<appport>) ──► app
```

- **PostgREST** is exactly what Supabase runs under the hood, so `.from()/.rpc()` and **RLS keep working unchanged** when supabase‑js is pointed at a local gateway.
- **Local auth (P3)** mints a **JWT in the same shape Supabase uses** (`sub`=user id, `role`=authenticated), signed with a local secret PostgREST trusts → `auth.uid()` / `erp_user_company_id()` work unchanged.
- The **Next.js server hosts a thin gateway** (`/auth/v1/*` → local auth; `/rest/v1/*`, `/rpc/*` → PostgREST) so supabase‑js needs only a different base URL + anon/JWT — **near‑zero app changes**.

This is the single biggest decision: it keeps **one shared codebase** (same pages, server actions, RPCs, migrations) for cloud and offline.

> Fallback if PostgREST bundling is painful on either OS: replace `createClient()` with a `pg` (node‑postgres)‑backed adapter implementing the subset of the supabase‑js builder we use. Higher effort; avoided unless forced.

---

## Phase P0 — Shared Offline Core

**Goal:** a headless local stack that boots Postgres, runs migrations, seeds a company + admin, and exposes the gateway — runnable on macOS and Windows from the CLI (no shell yet).

**Files expected to change / add**
- `src/lib/offline/runtime.ts` (new) — mode detection (`KAKO_OFFLINE=1`), resolve per‑OS paths (data dir, binaries, ports, secrets), single‑instance lock.
- `src/lib/edition/editions.ts` (new) — **edition descriptors** (retail/pharmacy/restaurant/fmcg → brand, businessType, modules, assets, license productCode); `currentEdition()` reads `KAKO_EDITION` (defaults to `retail`). Wired now so seed + branding + license all read one source.
- `src/lib/offline/config.ts` (new) — local config (ports, PG creds from OS secret store, JWT secret, license path).
- `scripts/offline/db.(ts|sh)` (new) — `initdb` / `start` / `stop` / `health` / `pg_dump` wrappers around bundled `pg_ctl`/`pg_isready`.
- `scripts/offline/migrate.ts` (new) — **migration runner**: applies `supabase/migrations/00xx_*.sql` in order, tracked in a local `schema_migrations` table (idempotent; our migrations already are).
- `scripts/offline/bootstrap.ts` (new) — first‑run: initdb → start → migrate‑to‑head → seed.
- `scripts/offline/seed.ts` (new) — **local company seed** (one `erp_companies` row with `business_type` from the **edition descriptor**, default warehouse/branch) + **local admin seed** (admin user + role). Seed is edition‑driven, not hard‑coded to retail.
- `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` (edit) — when offline, point at the local gateway URL + use the local JWT.
- `next.config.mjs` (edit) — `output: 'standalone'` for packaging.
- `package.json` (edit) — `offline:bootstrap`, `offline:db`, `offline:dev` scripts.
- `supabase/migrations/0xxx_offline_local_auth.sql` (new, additive, **offline‑only**) — `erp_local_users` (email, bcrypt hash, profile/company link) + a `auth.uid()` shim that reads the JWT claim (no‑op on cloud where it already exists).

**Risks**
- Migration runner divergence from the cloud apply path → mitigate by tracking `schema_migrations` and asserting head == latest file.
- supabase‑js base‑URL/JWT wiring subtleties (paths, headers) → cover with an integration test against the local gateway.
- Path/permission differences (macOS `~/Library/Application Support` vs Windows `%PROGRAMDATA%`).

**Tests**
- Unit: path/mode resolution per‑OS; migrate runner ordering + idempotency (re‑run = no‑op).
- Integration (local PG, both OS): bootstrap → migrate‑to‑head → seed → `SELECT 1` via the gateway → a sample `.from()`/`.rpc()` round‑trip returns the seeded company.
- Reuse existing `npm run test:db` against the local instance.

**Acceptance criteria**
- `offline:bootstrap` on a clean machine produces a running DB at head with one company + admin, and a gateway answering `.from('erp_companies')`.
- Re‑running bootstrap is idempotent (no duplicate seed, no failed migration).

**Rollback plan**
- All additive (new dirs/scripts + one offline‑only migration). Offline mode is gated by `KAKO_OFFLINE`; cloud build is unaffected. Revert = delete `src/lib/offline`, `scripts/offline`, the offline migration, and the `output:'standalone'`/script edits.

---

## Phase P1 — macOS Offline Spike (Apple Silicon first)

**Goal:** the full local stack running inside a **Tauri** window on the dev Mac, POS happy path + backup/restore + printer verified.

**Files expected to change / add**
- `src-tauri/` (new) — `tauri.conf.json`, `src/main.rs` (spawn/stop the 3 sidecars, health‑gate the window, menu‑bar/tray), `capabilities/*`, icons.
- `src-tauri/binaries/` (new) — **arm64** PostgreSQL + PostgREST sidecars (per Tauri's `externalBin` naming, `-aarch64-apple-darwin`).
- `scripts/offline/macos/` (new) — LaunchAgent template (optional), arm64 binary fetch/repackage, signing placeholders.
- `src/lib/offline/runtime.ts` (edit) — macOS paths (`~/Library/Application Support/KakoRetail/{db,backups}`), Keychain secret access.
- `package.json` (edit) — `tauri:dev`, `tauri:build:mac` scripts.

**Risks**
- **Bundling arm64 Postgres + PostgREST** + getting them to run as Tauri sidecars (exec bit, code‑sign for local run).
- WKWebView quirks vs the app's UI (rare; fonts/RTL already fine in browsers).
- Printer access from a packaged app (USB/Bluetooth thermal) — macOS driver/permission prompts.

**Tests**
- Manual smoke: launch app → DB+gateway healthy → login (temp local auth or seeded) → **POS happy path** (scan/sell cash + installment) → print receipt (80mm) → **Backup Now** → **restore preview + apply** on a modified copy → disaster‑recovery mini‑run.
- Automated: a headless "boot + health + one sale via RPC" test invoked by the spike harness.

**Acceptance criteria**
- One‑command `tauri:dev` on Apple Silicon brings up the window with a working offline POS, a successful cash + installment sale, a printed receipt, and a successful backup → restore.
- No network calls after launch (verified with Little Snitch / `nettop`).

**Rollback plan**
- `src-tauri/` is isolated; deleting it + the mac scripts removes the spike with zero impact on the web app.

---

## Phase P2 — Windows Offline Spike

**Goal:** the same stack on Windows 10/11, with the service/tray strategy.

**Files expected to change / add**
- `src-tauri/binaries/` (add) — **x64** PostgreSQL + PostgREST sidecars (`-x86_64-pc-windows-msvc`).
- `scripts/offline/windows/` (new) — NSSM/sc.exe service templates (optional), firewall‑rule (LAN opt‑in), binary fetch.
- `src/lib/offline/runtime.ts` (edit) — Windows paths (`%PROGRAMDATA%`/`%LOCALAPPDATA%`), Credential Manager secret access.
- `src-tauri/tauri.conf.json` (edit) — Windows bundle (NSIS/WiX), tray.
- `package.json` (edit) — `tauri:build:win`.

**Risks**
- **Windows service vs shell‑managed child processes** — decide: default to **shell‑managed sidecars + autostart** (simplest, no admin); offer a service mode later.
- Port conflicts with an existing local Postgres → dynamic port (already in P0).
- SmartScreen on unsigned binaries during dev (defer to P6 signing).

**Tests**
- Same manual smoke matrix as P1 on Windows (POS happy path, printer, backup/restore).
- Automated boot+health+sale test on a Windows runner.

**Acceptance criteria**
- `tauri:build:win` installs and runs the offline POS on a clean Windows 10/11 VM; cash + installment sale; printed receipt; backup → restore; no post‑launch network.

**Rollback plan**
- Windows assets are additive under `src-tauri`/`scripts/offline/windows`; remove to revert.

---

## Phase P3 — Local Auth (replace Supabase Auth for offline)

**Goal:** offline login without Supabase Auth; mint JWTs the gateway/RLS trust; map `auth.uid()` + company scope to the local session.

**Files expected to change / add**
- `supabase/migrations/0xxx_offline_local_auth.sql` (from P0, finalize) — `erp_local_users` (id, email, bcrypt_hash, profile_id, is_active), seed link to `erp_profiles`/company.
- `src/lib/offline/auth.ts` (new) — verify bcrypt, mint a Supabase‑shaped **JWT** (`sub`, `role:authenticated`, exp) signed with the local secret.
- `src/app/(offline)/login/*` or reuse `src/app/(auth)/login` (edit) — offline login posts to the local auth endpoint.
- `src/app/api/auth/v1/[...]` (new) — local `/auth/v1` endpoints (token, user) the app/gateway expect.
- `src/lib/supabase/server.ts` (edit) — read the local session cookie → attach JWT to gateway calls.
- PostgREST config (in `src-tauri`) — `jwt-secret` = local secret; `db-anon-role`.

**Risks**
- JWT/claims shape mismatch → `auth.uid()` returns null → RLS denies everything. Mitigate with a focused test asserting a minted token resolves `auth.uid()` + `erp_user_company_id()`.
- Password reset offline (no email) → admin‑reset flow + recovery code.
- Session security on a shared store PC → short‑lived JWT + re‑login; signed, HttpOnly cookie.

**Tests**
- Unit: bcrypt verify; JWT mint/verify; claim mapping.
- Integration: login → token → `.from()` returns only the company's rows (RLS holds); a second seeded company's rows are invisible (tenant isolation, even single‑company).
- Negative: wrong password rejected; expired token rejected.

**Acceptance criteria**
- Offline login works with no network; the minted token drives RLS exactly like cloud (`auth.uid()` + company scope correct); tenant isolation verified.

**Rollback plan**
- Offline auth is gated by `KAKO_OFFLINE`; cloud keeps Supabase Auth. The `erp_local_users` migration is additive and unused on cloud. Revert = drop the offline auth module + endpoints.

---

## Phase P4 — Licensing (offline‑verifiable, multi‑store/terminal/edition‑ready)

**Goal:** signed license, device fingerprint, online + air‑gapped activation, transfer — verified fully offline at every launch. **v1 enforces single‑terminal**, but the **license format + verifier carry the full commercial model** (per‑customer, per‑device, terminal cap, paid upgrade, edition) so later steps are config/data‑only, never re‑architecture.

**License document (signed) — fields present from v1**
```
{ licenseId, customerId, edition, productCode,          // who + what edition/brand
  tier, issuedAt, validUntil,                           // paid upgrade / expiry
  maxTerminals,        // enforced = 1 in v1, N later
  activations: [ { deviceFingerprint, activatedAt } ],  // per‑device seats
  storeGroupId?,       // reserved for multi‑store chains
  features: { ... },   // edition/tier feature flags
  signature }          // Ed25519 over the canonical payload
```

**Files expected to change / add**
- `src/lib/license/types.ts` (new) — the license schema above (full model now; v1 just caps `maxTerminals=1`).
- `src/lib/license/verify.ts` (new) — verify signature (embedded Ed25519 public key); enforce `edition`+`productCode` match the running edition, `validUntil`, `features`, and **`activations.length ≤ maxTerminals`**; bind this device's fingerprint to a seat.
- `src/lib/license/activate.ts` (new) — claim a seat (add fingerprint to `activations`), **transfer/deactivate** a seat, **upgrade** (consume a re‑issued/upgrade token online or air‑gapped) — all written to the stored license + re‑verified.
- `src-tauri/src/fingerprint.rs` (new) — device fingerprint (macOS `IOPlatformUUID`; Windows `MachineGuid`+SMBIOS UUID+disk serial), normalized to a salted hash.
- `src/app/(offline)/activate/*` (new) — activation UI: key entry, **Request Code** display, **Activation Code** entry (air‑gapped), online activate button; shows edition/seat usage (`x of maxTerminals`).
- `src/lib/license/store.ts` (new) — persist the signed license file in the app data dir (+ OS secret store for the secret).
- `licensing-server/` (separate service, out of the app bundle) — issues signed, device‑bound, **edition‑/terminal‑/customer‑scoped** licenses and upgrade tokens; **planning artifact only here** (the offline app only *verifies*, never *issues*).

**Risks**
- Fingerprint drift (disk swap) → false lockout → fuzzy match (tolerate one component change) + easy re‑activation/seat transfer.
- Clock tampering → store last‑seen time; detect rollback (protects `validUntil`/upgrade gating).
- Air‑gapped UX friction → short, scannable Request/Activation codes (QR + text).
- **Over‑designing v1** → ship with `maxTerminals=1` *enforced*; multi‑terminal stays dormant‑but‑present so we don't accidentally sell seats we haven't tested.
- Seat‑cap enforcement offline (no central server) → each device's stored license tracks its own seat; chain/multi‑terminal reconciliation deferred to the (online) licensing server + periodic re‑validation.

**Tests**
- Unit: signature verify (valid/expired/tampered); edition/productCode mismatch rejected; **`maxTerminals` cap** (1 passes, 2nd device on a 1‑seat license refused; on a mocked N‑seat license, N pass and N+1 refused); fingerprint hashing per‑OS (mock inputs).
- Integration: online activation round‑trip (stub server) → license stored → offline launch passes; air‑gapped request→response cycle; **transfer** (deactivate frees a seat, re‑activate elsewhere); **upgrade** token raises `tier`/`maxTerminals`/`validUntil` and re‑verifies.
- Negative: tampered license rejected; wrong‑device license rejected; wrong‑edition license rejected.

**Acceptance criteria**
- A fresh install activates online **or** air‑gapped, then launches with **no network**; license survives reboot; transfer works; the running build refuses a license issued for a different edition.
- The verifier **honors `maxTerminals`** (proven at 1 and at a mocked N) and exposes seat usage — so multi‑terminal/paid‑upgrade/edition licensing is a server‑side issuance change, not an app re‑architecture.

**Rollback plan**
- Licensing gate is a feature flag (`KAKO_REQUIRE_LICENSE`); can ship the spike with it off. Revert = remove `src/lib/license` + activation UI + the Rust fingerprint module.

---

## Phase P5 — Backup/Restore Hardening

**Goal:** production‑grade local backup (logical + physical), scheduling, restore preview, and a repeatable disaster‑recovery test — reusing the already‑built engine.

**Files expected to change / add**
- (reuse) `erp_snapshot_company` / `erp_create_backup` / restore preview‑apply (migrations 0163/0172/0173 + `settings/backup/*`).
- `scripts/offline/backup.ts` (new) — nightly **physical `pg_dump -Fc`** alongside the JSON snapshot; write to local folder + chosen external/USB/network target; optional AES‑256.
- `src/lib/offline/scheduler.ts` (new) — offline scheduler (app timer) **or** local `pg_cron`; runs `erp_create_backup` + `pg_dump` per the frequency setting.
- `src/app/(app)/settings/backup/*` (edit) — surface physical backup + off‑machine target + "verify restore" (reuse the existing preview UI).
- `scripts/offline/restore.ts` (new) — full physical restore (stop → `pg_restore`/data‑dir swap → start → migrate‑to‑head) wrapped behind a confirm.

**Risks**
- Off‑machine permissions (macOS removable‑volume/Full Disk Access; Windows UNC creds) → verify writability before scheduling; warn on failure.
- Cross‑OS restore (W↔M) must use **JSON or `pg_restore`**, never raw data‑dir copy → enforce in UI.
- Large history backup size → retention prune (built) + compression.

**Tests**
- Reuse the existing **disaster‑recovery simulation** (create→backup→delete→restore; all 6 entities + inventory recovered) — now run on the local stack on **both OS**.
- Integration: scheduled backup fires; retention prunes; physical `pg_restore` round‑trips; off‑machine target write verified.

**Acceptance criteria**
- On both OS: scheduled + manual backups (JSON + physical) land locally and off‑machine; restore preview shows new/existing/conflict/skip; a full disaster‑recovery run recovers all entity types; cross‑OS JSON restore verified W↔M.

**Rollback plan**
- Additive scripts + reuse of shipped engine; offline scheduler gated by mode. Revert = remove offline backup scripts; the cloud backup/restore stays intact.

---

## Phase P5C — Recovery Certification (gate after P5, before packaging)

**Goal:** *prove*, on the real local stack, that a store can survive total data loss — not just that backup/restore "ran." This phase is a **certification gate**: P6 packaging does not start until the certification report is signed off.

**Procedure (run on both OS: macOS ASi + Windows)**
1. **Create real sample data** — customer + supplier (each with an opening balance), product (with stock), a cash invoice, an installment contract (with at least one collected payment), and an inventory adjustment. Record **before** counts + balances.
2. **Create backup** — full local backup (JSON snapshot **and** physical `pg_dump -Fc`).
3. **Simulate loss** — destructive event on a *copy* of the data dir (drop/truncate or full data‑dir wipe) to emulate disk failure/corruption.
4. **Restore** — restore from the backup (preview → confirm → apply for JSON; `pg_restore`/data‑dir swap for physical).
5. **Verify (all must match before):**
   - record **counts** (customers, suppliers, products, invoices, installments, adjustments),
   - **customer balances** and **supplier balances**,
   - **inventory quantities** per product/warehouse,
   - **installment** contracts + schedules + paid amounts,
   - **customer statements** (line‑by‑line + closing balance),
   - **supplier statements** (line‑by‑line + closing balance).
6. **Emit certification report** — `docs/OFFLINE-RECOVERY-CERTIFICATION.md` with before/after tables, per‑check PASS/FAIL, OS + edition + build hash, timestamp, and a signed‑off line. Any FAIL blocks the gate.

**Files expected to change / add**
- `scripts/offline/recovery-cert.ts` (new) — orchestrates create → backup → simulate‑loss → restore → verify; diffs before/after; renders the report. Re‑uses the P5 engine and the existing disaster‑recovery simulation, extended with the **statement/balance/installment** assertions above.
- `docs/OFFLINE-RECOVERY-CERTIFICATION.md` (new, generated) — the certification artifact.
- `src/lib/erp/__tests__/recovery-cert.test.ts` (new) — automated assertion harness used by the script (and CI‑runnable against the local stack).

**Risks**
- A "restore ran" false‑positive that misses a financial mismatch → certification asserts **balances/statements/quantities**, not just row counts.
- Cross‑OS restore divergence → run the full matrix on both OS; cross‑OS JSON restore (W↔M) included.
- Physical vs logical restore differences → certify **both** restore paths.

**Tests**
- The certification script *is* the test; it must end PASS on both OS for every check, twice (JSON path and physical path).

**Acceptance criteria**
- A green `OFFLINE-RECOVERY-CERTIFICATION.md` on both OS: every before/after check matches (counts, balances, inventory qty, installments, customer + supplier statements), for both restore paths. **No FAIL anywhere.** This is the hard gate into P6.

**Rollback plan**
- Pure verification + a generated doc; nothing to roll back. A failed certification simply blocks packaging and sends the relevant defect back to P5.

---

## Phase P6 — Installer / Packaging

**Goal:** signed, notarized installers for macOS (ASi first) and Windows, with tray/menu‑bar and correct startup.

**Files expected to change / add**
- `src-tauri/tauri.conf.json` (edit) — macOS DMG + Windows NSIS/WiX bundles; tray/menu‑bar; `externalBin` (Postgres/PostgREST/Node) per‑target.
- `src-tauri/entitlements.plist` (new) — hardened‑runtime entitlements for macOS.
- `scripts/release/mac.sh` (new) — Developer ID **signing of the app AND every bundled binary** → `notarytool` → staple.
- `scripts/release/windows.ps1` (new) — EV **code‑sign** installer + sidecar `.exe`s.
- `.github/workflows/offline-release.yml` (new) — CI matrix **(OS × edition)**: {macos‑14 arm64, windows‑latest} × {retail, pharmacy, restaurant, fmcg}, building/signing per‑edition artifacts from the **edition descriptor** (app id, name, icons, productCode) — proving brand separation works with no core fork.
- `package.json` (edit) — `release:mac`, `release:win`.

**Risks**
- **macOS:** every bundled executable must be signed + hardened‑runtime + notarized, or **Gatekeeper** kills sidecars. Highest‑effort item.
- **Windows:** SmartScreen on new EV cert until reputation builds.
- Startup behavior (autostart, single instance, relaunch after crash).
- macOS **Intel** slice: universal2 vs separate arch builds (decide here; Intel only if feasible).

**Tests**
- Install on **clean** machines (no dev tools): macOS ASi (and Intel if attempted), Windows 10/11 VM → app launches, no Gatekeeper/SmartScreen block, offline POS works.
- Automated: CI produces signed, notarized artifacts; a "verify signature/notarization" step.

**Acceptance criteria**
- Signed DMG installs + runs on a clean Apple‑Silicon Mac with no Gatekeeper warning; signed EXE/MSI installs + runs on clean Windows with no SmartScreen block; both launch the offline POS; no post‑launch network.

**Rollback plan**
- Packaging configs/scripts are additive; reverting leaves the dev‑mode spike working. Keep the previous signed artifact for re‑distribution.

---

## Phase P7 — Updates / Rollback

**Goal:** safe in‑place updates with a mandatory pre‑update backup and one‑click rollback, online or via an offline update file.

**Files expected to change / add**
- `src-tauri/tauri.conf.json` (edit) — Tauri **signed updater** config (endpoints + pubkey) for both OS.
- `src/lib/offline/update.ts` (new) — apply an **offline `.update` file** (verify signature → stop sidecars → **pre‑update `pg_dump`** → swap app/binaries → **migrate‑to‑head** → restart → health‑check).
- `scripts/offline/rollback.ts` (new) — restore the previous app build + pre‑update dump.
- `scripts/release/*` (edit) — produce signed update packages + the offline `.update` bundle.

**Risks**
- Migration failure mid‑update on a live store → mandatory pre‑update full backup + transactional/idempotent migrations + automatic rollback on failure.
- Updater signing keys management (separate from license keys).
- Partial download/corruption (online) → checksum + signature verify before apply.

**Tests**
- Integration: update N→N+1 with a schema change → pre‑backup taken → migrate to head → POS still works; simulate a failing migration → auto‑rollback restores N.
- Offline `.update` file applied from USB on both OS.

**Acceptance criteria**
- Online and offline updates apply with a verified pre‑update backup, migrate to head, and keep the POS working; a forced failure rolls back cleanly to the prior build + data.

**Rollback plan**
- The updater is opt‑in per channel; the pre‑update full backup + retained prior build is the rollback. Revert the feature = disable the updater endpoint.

---

## Cross‑phase notes
- **One migration chain** (`supabase/migrations`) is the source of truth for cloud and offline; CI already builds the DB from it (`supabase/ci/setup-test-db.sh`).
- Everything offline is **gated by `KAKO_OFFLINE`** so the cloud build/tests are never affected (the web app and PR #123 stay green).
- **One core, many editions** (`KAKO_EDITION`) and **one license format** (full commercial model, single‑terminal enforced in v1) are wired from P0/P4 so brand + multi‑store/terminal expansion is config/issuance, not a refactor.
- The **build order is P0 → P1 (macOS ASi) → P2 (Windows) in parallel → P3 → P4 → P5 → P5C (certification gate) → P6 → P7**, but P0+P1 are the first deliverable so it can be tested directly on the dev Mac.

---

## Commercial Readiness Review (publish before the Offline project closes)

A required deliverable before sign‑off: `docs/OFFLINE-COMMERCIAL-READINESS.md`, populated with **measured** numbers from the P5C/P6 builds (the figures below are **planning estimates** to be confirmed, not final specs).

| Item | Planning estimate (to be confirmed on real builds) | How it will be measured |
|---|---|---|
| **Installer size** | ~120–180 MB per edition (Tauri shell + Postgres 17 + PostgREST + Node standalone server, compressed) | size of the signed DMG / EXz on the P6 build |
| **RAM usage (idle/active)** | ~250–400 MB idle, ~500–800 MB during POS/reporting (Postgres + PostgREST + Node + WebView) | `Activity Monitor` / `Task Manager` on the P1/P2 spike |
| **Disk growth / year** | ~0.5–2 GB/yr for a typical single store (≈50–300 invoices/day incl. indexes + retained backups before prune) | extrapolate from a seeded year of synthetic data |
| **Supported products** | tens of thousands comfortably (100k+ feasible) on local Postgres 17 with existing indexes | load test in P5C harness |
| **Supported invoices** | hundreds of thousands → low millions over the device's life (bounded by disk, not engine) | load test + disk‑growth model |
| **Supported customers** | tens of thousands comfortably | load test |
| **Single‑terminal limit** | **1 active terminal** (`maxTerminals=1`, enforced in v1) | P4 verifier test |
| **Multi‑terminal limit** | designed‑in (`maxTerminals=N`, seat‑capped); LAN shared‑DB topology documented as a later option | P4 mocked‑N test; topology note |
| **Recommended selling model** | per‑customer license, per‑device activation, edition‑based pricing, annual maintenance/upgrade tier; chains via per‑store sub‑licenses | maps 1:1 to license claims (P4) |
| **Recommended support model** | offline‑first support: built‑in backup + one‑click restore + recovery certification as the safety net; remote assist via exported diagnostics bundle; update/rollback channel (P7); air‑gapped activation for no‑internet sites | derived from P5/P5C/P7 |

**Acceptance for closing the project:** `OFFLINE-COMMERCIAL-READINESS.md` published with the estimate column **replaced by measured values** from the signed P6 builds on both OS, alongside a green `OFFLINE-RECOVERY-CERTIFICATION.md`.

**Next step after approval:** implement **P0 (Shared Offline Core)** and the **macOS spike (P1)** first.
