# VANTORA Offline — Release-Candidate QA Report

**Codebase:** `nabilhahaha/Kako` @ `feat/auto-updater` (`9442ba5`) · version **`0.1.0-beta.1`**
**Stack:** Tauri 2 + Next.js 15 (standalone) + bundled PostgreSQL 17 / PostgREST, rendered in **macOS WKWebView**
**Print fix:** committed locally on `claude/vantora-printing-fix` (NOT pushed, NOT a DMG)

> **Central theme:** the app is **well-architected but unexercised on the real desktop target.** Almost every defect is invisible under `next dev` in a browser and only appears in the packaged DMG (WKWebView + the production sidecar supervisor, which is a *different* code path than the working dev supervisor). None of this is an auth *regression* — the working web auth is intact.

Legend — Severity: 🔴 Blocker · 🟠 High · 🟡 Medium · ⚪ Low/Nice-to-have. Verified: **✔ me** (re-verified firsthand) / agent (review).

---

## 1. PASS / FAIL Matrix

| ID | Area | Verdict | Sev | Verified |
|----|------|---------|-----|----------|
| **Offline Runtime** |
| RT-1 | Packaged app shows its window on launch | ❌ FAIL | 🔴 | agent |
| RT-2 | Health gate confirms stack ready (`/api/health`, not bare TCP) | ❌ FAIL | 🔴 | agent |
| RT-3 | PostgREST+Next torn down on quit (no port leak next launch) | ❌ FAIL | 🔴 | agent |
| RT-4 | Next standalone started with correct `cwd` | ❌ FAIL | 🟠 | agent |
| RT-5 | Bootstrap failure aborts (no gateway on uninit DB) | ❌ FAIL | 🟠 | agent |
| RT-6 | Pre-migrate backup on minor/patch upgrades | ❌ FAIL | 🟠 | agent |
| RT-7 | PostgreSQL init / data-dir stability / teardown of PG | ✅ PASS | — | agent |
| RT-8 | Seed idempotency + role (`owner` correct; no `setup_done` bug) | ✅ PASS | — | agent |
| RT-9 | Per-build shared JWT secret / 10yr anon token | ⚠️ RISK | 🟡 | agent |
| RT-10 | Sidecar bundling (gitignored, fetched at build, macOS-only) | ⚠️ RISK | ⚪ | agent |
| **Auth / License** |
| AU-1 | License enforced at launch (app refuses to run unlicensed) | ❌ FAIL | 🔴 | ✔ me |
| AU-2 | Activation binds *this* device (`activations[]`) | ❌ FAIL | 🔴 | agent |
| AU-3 | Session persists across restart / >12h idle | ❌ FAIL | 🔴 | ✔ me |
| AU-4 | `/activate` reachable pre-login (offline catch-22) | ❌ FAIL | 🟠 | agent |
| AU-5 | Offline build never falls back to cloud Supabase | ❌ FAIL | 🟠 | ✔ me |
| AU-6 | `device_fingerprint` Tauri-ready timing + retry | ❌ FAIL | 🟠 | agent |
| AU-7 | macOS fingerprint robustness (empty-UUID) | ❌ FAIL | 🟠 | agent |
| AU-8 | Activation error feedback on save failure | ❌ FAIL | 🟡 | agent |
| AU-9 | Login / logout / re-login (offline GoTrue happy path) | ✅ PASS | — | agent |
| AU-10 | License crypto (Ed25519, expiry, seat-cap, tamper fail-closed) | ✅ PASS | — | agent |
| **Desktop Features** |
| DF-1 | Reaching print/receipt pages (`window.open`/`target=_blank`) | ❌ FAIL | 🔴 | agent |
| DF-2 | Clicking Print on a print page (`window.print()`) | 🟢 FIXED | — | ✔ me |
| DF-3 | Export / CSV / backup / import-template downloads | ❌ FAIL | 🔴 | ✔ me |
| DF-4 | File save dialogs (`tauri-plugin-dialog`/`fs` absent) | ❌ FAIL | 🟠 | agent |
| DF-5 | `export-panel` navigates main window to raw CSV/JSON | ❌ FAIL | 🟠 | agent |
| DF-6 | External links (`wa.me` support/renew CTAs) open | ❌ FAIL | 🟡 | agent |
| DF-7 | File read/import (`<input type=file>`) | ✅ PASS | — | agent |
| DF-8 | All 7 Tauri IPC commands registered & reachable | ✅ PASS | — | agent |
| DF-9 | Update flow (channels, pubkey, major-backup, web-guard) | ✅ PASS | — | agent |
| **Navigation** |
| NV-1 | Sidebar→route integrity (zero dead links / 404s) | ✅ PASS | — | agent |
| NV-2 | All module pages render | ✅ PASS | — | agent |
| NV-3 | Native `confirm/prompt` vs in-app dialog (one msg = `'?'`) | ⚠️ RISK | 🟡 | agent |
| NV-4 | `navigator.clipboard` over http-localhost | ⚠️ RISK | ⚪ | agent |
| **Build / Release** |
| BR-1 | DMG ever built / CI compiles the Rust shell | ❌ FAIL | 🔴 | agent |
| BR-2 | macOS Developer-ID signing + notarization (Gatekeeper) | ❌ FAIL | 🔴 | agent |
| BR-3 | Updater signing key ↔ embedded pubkey match | ⚠️ UNVERIFIABLE | 🔴 | agent |
| BR-4 | One release path that signs+notarizes AND publishes manifest | ❌ FAIL | 🟠 | agent |
| BR-5 | Version story (`beta.6` does not exist in remote) | ❌ FAIL | 🟠 | ✔ me |
| BR-6 | Sidecar download checksum pinning | ⚠️ RISK | ⚪ | agent |
| BR-7 | Windows path / doc drift / DMG runbook | ⚠️ GAP | ⚪ | agent |
| BR-8 | Version-sync automation (`sync-version.mjs`) | ✅ PASS | — | agent |

**Tally:** 19 FAIL · 6 RISK/GAP · 11 PASS · 1 FIXED.

---

## 2. Critical Blockers (🔴)

### RT-1 — Packaged app window never appears
- **Root cause:** `main.rs:186` runs `start-gateway.mjs` with blocking `.status()`; that script (`start-gateway.mjs:58-65`) spawns PostgREST/Next without `unref()`/`detached` and never exits, so the call never returns → `wait_healthy()`/`win.show()` (`main.rs:188-191`) are never reached. Window is `visible:false` (`tauri.conf.json:22`). The DMG boots the stack into a permanently hidden window.
- **Fix:** spawn the gateway non-blocking (`.spawn()`, keep the child handle for shutdown) instead of `.status()`; or `child.unref()` + `process.exit(0)` in the script (then track PIDs for RT-3).

### RT-2 — Health gate is a bare TCP connect
- **Root cause:** `wait_healthy` (`main.rs:99-112`) only `TcpStream::connect`s port 54331 and ignores the real `/api/health` route (`let _ = &url;`, `main.rs:106`). Next can accept TCP before PostgREST/PG are serving → window can flip onto a 500 UI. Failure branch only logs (`main.rs:194`) → headless hang, no user-visible error.
- **Fix:** HTTP GET `http://127.0.0.1:54331/api/health`, require `{ok:true}`; on timeout show an error window/dialog.

### RT-3 — PostgREST + Next leak on quit → second launch fails
- **Root cause:** `shutdown.mjs:15` only runs `db.mjs stop` (Postgres). Nothing stops PostgREST/Next, and the spawn model (RT-1) leaves them untracked. Orphans hold 54330/54331; next launch can't bind → compounds RT-1/RT-2 into a permanent hidden-window failure.
- **Fix:** track gateway children (PID file in runDir or Rust child handles) and kill them before stopping PG (pattern exists in `dev-stack.mjs:89-91`).

### AU-1 — License never enforced
- **Root cause:** `verifyLicense`/`hasLicense`/`loadLicense` have **zero call sites** outside tests + the install action — no check in `middleware.ts`, layouts, or `main.rs` (grep-confirmed). The paid app runs with no license; activation is cosmetic.
- **Fix:** add a launch gate (Rust `setup`/health step, or Next middleware when `isOffline()`) that `loadLicense` + `verifyLicense` against the device fingerprint and redirects to `/activate` (or refuses the window) on `ok===false`.

### AU-2 — Activation does not bind the device
- **Root cause:** `activate/actions.ts:30-33` installs + saves the license verbatim; `installLicense` (`license/activate.ts:52-64`) never appends an `Activation{deviceFingerprint}`; the form fetches the fingerprint but never sends it; `buildActivationRequest` is dead code. With AU-1 fixed, `verifyLicense` step 5 (`verify.ts:65-66`, `device-not-activated`) would then reject the just-activated device.
- **Fix:** capture fingerprint client-side, pass to `installLicenseAction`, and either require the server to embed it (verify post-install) or append to `activations[]` and re-verify.

### AU-3 — Offline session dies past 12h (no real refresh)
- **Root cause:** `gateway.ts:50` sets `refresh_token = session.token` (the access JWT, 12h TTL `gateway.ts:39`). The refresh route (`auth/v1/token/route.ts:33`) calls `verifyBearer`→`verifyToken`, and `jwt.ts:88` rejects expired tokens → `invalid_grant` (`route.ts:34`). Proactive refresh keeps an *actively-running* app alive, but any restart/idle beyond the token lifetime forces re-login. Breaks "session persistence across restarts."
- **Fix:** issue a distinct long-lived refresh token, OR have the refresh route verify signature-only (ignore `exp`) for the refresh grant and re-mint.

### DF-1 — Print/receipt pages are unreachable
- **Root cause:** ~30 entry points open the print routes via `window.open('/print/...','_blank')` (`market/pos/cashier-terminal.tsx:78`, `wholesale/order/wholesale-order.tsx:76`) or `<Link target="_blank">` (sales/customers/suppliers/fashion/clinic/salon/restaurant/pharmacy/rep…). WKWebView won't open a new app window and Tauri creates none → click does nothing (worst case hands off to Safari, which can't reach `127.0.0.1` with the session). **My `print_webview` fix only helps once the page is reached.**
- **Fix:** stop relying on new windows — `router.push('/print/...')` in-window (page auto-offers print → native `print_webview`), or render the print template into a hidden iframe and call `printDocument()`.

### DF-3 — Export / backup / import downloads silently do nothing
- **Root cause:** five file-save sites use blob `<a download>`+`click()` or attachment navigation, none honored by WKWebView: `lib/export-csv.ts:14-21`, `settings/backup/backup-manager.tsx:25-27` (**backup export**), `settings/import/import-wizard.tsx:107-112`, `settings/field-governance/field-governance-manager.tsx:204-206`, `settings/export/export-panel.tsx:80` (navigates the main window to raw payload via `/api/export`).
- **Fix:** add `tauri-plugin-dialog` + `tauri-plugin-fs` (+ capabilities), a `saveFile(name,bytes)` helper mirroring `printDocument()`'s dual path, and route all five through it; for `export-panel`, fetch to a blob first instead of navigating.

### BR-1 — The DMG has never been built / no CI for the Rust shell
- **Root cause:** `Cargo.toml:7-10` and `main.rs:16-18` state the shell is only compiled on macOS/Windows target machines; `ci.yml` never touches it. First real build is unproven (externalBin staging order, dylib relocatability, sidecar download availability).
- **Fix:** do a real `tauri build` on a Mac (after `fetch-binaries.sh`); budget for iteration; add a macOS build job to CI.

### BR-2 — No proven signing + notarization → Gatekeeper blocks the DMG
- **Root cause:** bundle ships unsigned third-party Mach-O sidecars (node, PG tree, postgrest). The tag-triggered `release.yml:118` runs default `tauri build` with **no deep-sign of nested binaries and no `notarytool`/`stapler`** (`release.yml:20-26` admits unsigned builds "still succeed"). Only the manual `scripts/release/mac.sh:30-48` deep-signs + notarizes.
- **Fix:** provision Apple Developer-ID + notarization secrets; release via `mac.sh` (or fold its sign/notarize steps into `release.yml`). Without this the customer's Mac shows "damaged / unidentified developer."

### BR-3 — Updater signing key ↔ embedded pubkey match is unverifiable from the repo
- **Root cause:** `tauri.conf.json:76` embeds a pubkey; the private key lives only in `TAURI_SIGNING_PRIVATE_KEY` (correctly not committed). A mismatch makes every installed client silently reject auto-updates — discovered only in the field.
- **Fix:** verify out-of-band that the secret was generated from the same keypair as the embedded pubkey before shipping.

---

## 3. High-Priority Issues (🟠)

| ID | Root cause | Recommended fix |
|----|-----------|-----------------|
| RT-4 | Next standalone spawned without `cwd` (`start-gateway.mjs:50`); resolves `.next`/`public` from Finder's cwd (`/`) → asset/chunk 404s. | `spawn(node,[serverJs],{cwd:path.dirname(serverJs)})` (matches `dev-stack.mjs:77`). |
| RT-5 | `main.rs:183` logs but doesn't abort on bootstrap failure → starts gateway against uninit/unmigrated DB. | Abort startup + surface error when bootstrap fails or `KAKO_PG_BIN` missing. |
| RT-6 | Only MAJOR bumps back up data (`updater.rs:303`); `update.mjs` (mandatory pre-update dump→migrate→rollback) is **dead code**. Minor/patch schema migrations run on the customer's only copy with no snapshot. | Wire `update.mjs` into the updater for all bumps, or make `backup_data_dir` fire on any newer version. |
| AU-4 | `/activate` not in `PUBLIC_PATHS` (`supabase/middleware.ts:5`) → redirected to `/login`; with AU-1 this is a login↔license deadlock. | Add `/activate` to `PUBLIC_PATHS`. |
| AU-5 | `config.ts:12,15` hardcode a live cloud URL + anon key as fallback; if `NEXT_PUBLIC_SUPABASE_URL` is unset at build, a DMG points the WKWebView at the cloud. | When `KAKO_OFFLINE`, refuse cloud fallback (throw / force `127.0.0.1`). |
| AU-6 | `activate-form.tsx:22-24` reads `__TAURI__` once; if the bridge isn't ready at first paint, fingerprint stays `—` with no retry → can't activate. | Await `__TAURI__` readiness (or `@tauri-apps/api`) with retry. |
| AU-7 | `fingerprint.rs:17` `unwrap_or_default()` → empty UUID returned as Ok; collision risk + opaque downstream failure (`fingerprint.ts:38,49`). | Return an error (not Ok-with-empty) when no strong id is found. |
| DF-4/DF-5 | No `dialog`/`fs` plugin (root of DF-3); `export-panel` replaces the app UI with raw CSV. | Covered by the DF-3 `saveFile()` layer; fetch-to-blob for `export-panel`. |
| BR-4 | Two divergent macOS paths: `mac.sh` notarizes but skips updater manifests; `release.yml` does manifests but skips notarize → first DMG is either un-notarized or has no working update manifest. | Merge into one path that does both. |
| BR-5 | "beta.6" exists nowhere in the remote (only `v0.1.0-beta.0/.1`; no tags in clone). | Reconcile the real shipping version and tag it; don't promise "beta.6". |

---

## 4. Medium-Priority Issues (🟡)

| ID | Root cause | Recommended fix |
|----|-----------|-----------------|
| AU-8 | `installLicenseAction` doesn't wrap `saveLicense` (`actions.ts:33`); an fs throw leaves the UI with no error. | try/catch → `{ok:false,error:'save-failed'}`. |
| DF-6 | External `wa.me` links use `target="_blank"` with no OS-browser opener; the subscription-renewal CTA (`layout.tsx:72-80`) is the one that matters. | Add `tauri-plugin-opener`; intercept external `_blank` clicks. |
| NV-3 | ~9 files use native `confirm/prompt` instead of the in-app `useConfirm`; `survey-builder.tsx:47` prompts with literal `'?'`. | Migrate to `useConfirm`/`usePrompt`; fix the `'?'` message. |
| RT-9 | Per-build JWT secret + 10yr anon token shared across installs, extractable from the bundle (`build-app.mjs:16-19,38`). | Rotate per-install before any networked/multi-tenant future. |

---

## 5. Non-Blockers / Nice-to-Have (⚪)

| ID | Note |
|----|------|
| NV-4 | `navigator.clipboard` "copy secret" may silently fail over http-localhost; both call sites are try/caught. |
| RT-10 | Sidecars gitignored + fetched at build → build is network-dependent and macOS-only (no Windows `node.exe` staging). |
| BR-6 | `fetch-binaries.sh` pins versions but doesn't checksum-verify downloads. |
| BR-7 | Windows release commented out (`release.yml:66-67`); `auto-update.md:176` filename doc drift; no DMG build/sign/notarize runbook in `DEPLOYMENT.md`. |

---

## 6. Delivery Classification

### 🚫 Customer-delivery blockers (must fix before a paying customer)
RT-1, RT-2, RT-3 (app must launch, be ready, and survive a second launch) · AU-1, AU-2 (a paid product must enforce its license) · AU-3 (session must persist) · DF-1, DF-3 (print + backup/export are daily core workflows) · BR-1, BR-2, BR-3 (a Gatekeeper-clean, auto-updatable DMG).

### 🟡 Pilot-only acceptable (OK for a controlled, hand-held pilot; NOT for GA)
RT-6 (minor-upgrade backup — acceptable if you don't push schema-changing updates during the pilot) · RT-9 (shared JWT secret — single loopback box) · AU-4/AU-5 (mitigable by building with the offline env correctly set and pre-activating) · AU-6/AU-7/AU-8 (mitigable by pre-provisioning the licensed device for the customer) · DF-6, NV-3, NV-4 (cosmetic/secondary) · BR-5 (version label) · BR-7 (Windows/docs).

### 💡 Nice-to-have improvements
RT-4/RT-5 should really be fixed with the runtime blockers (cheap, same file) · BR-4 (consolidate release paths) before GA · BR-6 (checksum pinning) · RT-10 (Windows staging) for P2.

---

## 7. Release Readiness Assessment

**Verdict: 🔴 NO-GO for customer delivery.**

This is not a polish pass: **11 distinct blockers across four independent subsystems**, several individually fatal — the window never shows, the app runs unlicensed, backups silently fail, and the DMG would be Gatekeeper-blocked. Crucially, **none of the runtime blockers have ever been observed**, because the desktop path has never been built and the dev supervisor (`dev-stack.mjs`) is a *separate, correct* code path from production (`start-gateway.mjs` + `main.rs`). The web/business logic, license crypto, navigation, IPC wiring, and update *design* are solid — the gap is desktop-shell integration and a never-exercised release pipeline.

**Rough effort to a credible RC (on a Mac with the toolchain):** runtime trio RT-1..RT-3 (+RT-4/5) ≈ 1 day · auth AU-1/AU-2/AU-3 ≈ 1–2 days · WKWebView I/O layer DF-1/DF-3 ≈ 1–2 days · first signed+notarized build & auto-update round-trip ≈ unknown, multi-iteration. Do not commit a customer date before one clean end-to-end build+notarize+update round-trip.

**Recommended fix order:**
1. **Make it launch** — RT-1/RT-2/RT-3 (+RT-4/RT-5) so the app is testable at all.
2. **WKWebView I/O layer** — DF-1 (print reachability) + DF-3 (`saveFile`); my committed `print_webview` fix slots in here.
3. **Auth** — AU-1 enforcement + AU-2 device binding + AU-3 refresh (+ AU-4/AU-5).
4. **First signed/notarized macOS build** + auto-update round-trip — BR-1/BR-2/BR-3.

**No DMG was built and nothing was pushed.** The print fix remains local on `claude/vantora-printing-fix`.
