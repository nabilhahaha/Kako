# Offline Edition — Architecture Plan (cross‑platform: Windows + macOS)

**Status:** planning / design. **No implementation in this document.**
**Goal:** run the Retail Edition (Fashion/POS store) fully on a single desktop — **Windows or macOS** — with **no internet dependency after activation**, from **one shared codebase**.

**Target platforms**
1. **Windows 10/11 64‑bit** (x64)
2. **macOS Apple Silicon** (arm64, M1+)
3. **macOS Intel** (x86_64) — supported if feasible (see §I / §H)

**Invariant principles (unchanged across OS)**
- One shared codebase (Next.js app + the existing SQL/RPC/migration layer).
- **Local PostgreSQL** (reuse the entire cloud SQL layer — RPCs, triggers, migrations 0001→0173).
- Local app runtime (Node server for the Next.js app), served on `127.0.0.1`.
- **No internet dependency after activation.**
- Same Retail Edition features; **same backup/restore engine** (`erp_snapshot_company` / `erp_create_backup` / restore‑preview‑apply) — already proven by the disaster‑recovery simulation.

> Why local PostgreSQL (not SQLite): reuse ~25 `plpgsql` RPCs, triggers, RLS, `jsonb`, `pg_cron`, and the idempotent migration chain with near‑zero rewrite. This is the single biggest risk reducer and the reason the architecture is identical on both OSes at the data layer.

The architecture is a **3‑process local stack** on every platform:
`[Desktop shell + tray/menu bar]` → spawns → `[Node: Next.js server @127.0.0.1:<port>]` → connects → `[bundled PostgreSQL @127.0.0.1:<pgport>]`.
Only the **packaging, service management, and code‑signing** differ per OS.

---

## A) Packaging approach

| | **Tauri** (Rust shell) | **Electron** (Chromium+Node shell) | **Native browser + local service** |
|---|---|---|---|
| Installer size | ~3–10 MB shell (+ sidecars) | ~120–180 MB (+ sidecars) | smallest (no shell) |
| Runtime | OS WebView (WebView2 / WKWebView) | Bundled Chromium | OS browser |
| Bundling Node + Postgres | **Sidecars** (external binaries) | Sidecars (Node is built‑in; PG is a sidecar) | Both as OS services |
| Native tray / menu bar | ✅ both OS | ✅ both OS | ❌ (no native chrome) |
| Auto‑update | ✅ built‑in signed updater | ✅ electron‑updater (mature) | DIY |
| Code‑sign / notarize | ✅ documented, must sign each sidecar | ✅ electron‑builder automates | must sign service + installer |
| Security surface | Smaller (Rust, no Node in shell) | Larger (Node in renderer unless hardened) | App is "just a web page" → weak device integration |
| Team familiarity | Rust glue (small) | Pure JS/TS | Pure JS/TS |
| UX (kiosk/native window, single instance, deep‑links) | ✅ | ✅ | ❌ relies on a browser tab |

**Native browser + local service** is rejected for v1: no native window/menu‑bar/tray, fragile "is the tab open?" UX, weak peripheral/printer integration, and the user can close the browser and "lose" the POS. (It remains a fallback dev mode.)

### Recommendation: **Tauri** (primary), **Electron** as the documented fallback.
- The **heavy lifting is identical** for both shells — Postgres and the Next.js Node server run as **sidecar child processes** either way — so the shell choice mainly affects **size, native integration, updater, and signing ergonomics**.
- Tauri wins on **installer size** (matters for offline USB installs), **smaller security surface**, **native tray/menu bar on both OS**, and a **built‑in signed updater**; macOS notarization + Windows signing are well documented.
- **Choose Electron instead if** the team wants a **single JS toolchain** and maximal ecosystem maturity (electron‑builder automates Windows + DMG/PKG + notarization + auto‑update in one config). It's the lower‑velocity‑risk option.
- **Decision:** start on **Tauri**; keep an Electron escape hatch — if Node‑sidecar packaging or per‑binary notarization causes friction, switching is low cost because the app/DB layers are shell‑agnostic.

---

## B) Local PostgreSQL (bundle + manage, per platform)

We ship **PostgreSQL 17 binaries** (match the cloud major version so dumps/migrations are byte‑compatible). The app **never** assumes a system Postgres; it runs its own private instance on a **non‑standard loopback port** to avoid clashing with any existing install.

**Per‑platform binaries**
- **Windows x64:** bundle the official EDB Windows binaries (`postgres.exe`, `initdb.exe`, `pg_ctl.exe`, `pg_dump.exe`, `pg_isready.exe`).
- **macOS Apple Silicon (arm64):** bundle native arm64 PG binaries (EDB macOS arm64, or repackage Postgres.app's binaries).
- **macOS Intel (x86_64):** bundle x86_64 PG binaries. Ship a **universal app** carrying both arch slices, **or** two architecture‑specific installers; pick the slice at install/runtime. (Do **not** rely on Rosetta for the DB — ship native arm64 for ASi.)

| | Windows | macOS (ASi + Intel) |
|---|---|---|
| **Data directory** | `%PROGRAMDATA%\KakoRetail\db` (all‑users) or `%LOCALAPPDATA%\KakoRetail\db` (per‑user) | `~/Library/Application Support/KakoRetail/db` (per‑user) |
| **Binaries location** | app `resources\pgsql\bin` | app bundle `Contents/Resources/pgsql/bin` (signed + hardened‑runtime) |
| **Service / daemon** | A **Windows Service** (via NSSM/sc.exe) **or** a shell‑managed child process with autostart | A per‑user **LaunchAgent** (`~/Library/LaunchAgents/com.kako.retail.db.plist`) **or** a shell‑managed child process. Prefer LaunchAgent (no root). LaunchDaemon only if multi‑user/system‑wide is required. |
| **Startup** | `initdb` on first run → `pg_ctl start`; run migrations to head; then start the Node server | same sequence; first run `initdb`, start, migrate, then app |
| **Shutdown** | `pg_ctl stop -m fast` on app/tray quit + service stop | `pg_ctl stop -m fast` on quit / LaunchAgent unload |
| **Port binding** | `listen_addresses = '127.0.0.1'`, a **dynamic free port** picked at first run and persisted (default base 54329); never 5432 | same — loopback only, dynamic port persisted |
| **Health check** | `pg_isready -h 127.0.0.1 -p <port>` then `SELECT 1` with bounded retry/backoff; surface status in tray | identical; status in menu bar |
| **Auth (offline)** | `scram-sha-256` local role + a generated password stored in the app's secure store (Windows Credential Manager) | same, secret in macOS Keychain |

**Cross‑cutting**
- Replace Supabase Auth with **local auth** (a users table + bcrypt + a signed local session); re‑point `auth.uid()` / `erp_user_company_id()` to a local‑session function. A single company is seeded at install, so scoping is trivial.
- `pg_cron` runs locally for scheduled backups (already wired). If bundling `pg_cron` on macOS is awkward, fall back to an **app‑level scheduler** (the shell triggers `erp_create_backup` on a timer) — same effect.
- Backups: keep the loopback‑only, single‑instance, lock‑file guard so two app copies can't fight over one data dir.

---

## C) Installer strategy

### Windows
- **EXE/MSI** installer (Tauri NSIS/WiX, or electron‑builder). EV **code‑signing** of the installer + all bundled `.exe` sidecars (Postgres + Node) to clear **SmartScreen**.
- **Windows Service** (NSSM/sc.exe) for Postgres (+ optionally the Node server) so the POS starts at boot; or shell‑managed child processes with a Startup shortcut.
- **System‑tray app:** start/stop/status, Backup Now, open POS, check‑for‑updates.
- Adds a localhost firewall rule only on explicit **LAN opt‑in**; default is loopback‑only.
- Uninstall keeps `db` + `backups` by default (ask before deleting).

### macOS
- **DMG** (drag‑to‑Applications, simplest) **or** **PKG** (needed if installing a LaunchDaemon/system component). Recommend **DMG + per‑user LaunchAgent** (no root) for a single‑user store; PKG only if system‑wide.
- **Developer ID Application** signing + **hardened runtime** + **entitlements**, then **notarization** (`notarytool`) + **stapling**. **Every bundled executable** (Postgres binaries, Node, helper tools) must be signed with hardened runtime, or **Gatekeeper** kills them.
- **Menu‑bar app** (the Tauri/Electron tray equivalent): start/stop/status, Backup Now, open POS, updates.
- Entitlements likely needed: allow‑unsigned‑executable‑memory only if required by the JS engine; disable library validation only if a sidecar needs it; file‑access entitlements for chosen backup folders.
- Universal build (arm64 + x86_64) or two arch‑specific DMGs.

---

## D) Licensing

- **Signed license file** (Ed25519/RSA): issued by our licensing server, embeds license id, edition, device‑binding, issue/expiry, feature flags (e.g. # terminals). Verified **offline** with an embedded public key — no server call to run.
- **Activation flows (both OS):**
  - **Online:** enter key → one server round‑trip → receive a device‑bound signed license file stored locally → thereafter 100% offline.
  - **Offline / air‑gapped:** app shows a **Request Code** (device fingerprint + key) → customer relays it → we return an **Activation Code** (signed license) → verified offline.
- **Activation transfer:** a deactivate flow frees a seat (writes a local + server‑side, when online, deactivation record); the new device requests a fresh activation. Allow N self‑service re‑activations.
- **Device fingerprint — platform differences (normalize to one salted hash):**
  - **Windows:** registry `MachineGuid` + SMBIOS system UUID (WMI `Win32_ComputerSystemProduct.UUID`) + primary disk serial → hash.
  - **macOS:** `IOPlatformUUID` / hardware UUID (IORegistry) + model identifier → hash. (Do **not** use the MAC address — it changes/randomizes.)
  - Store fingerprint salt in the license; tolerate one component changing (e.g. disk swap) before requiring re‑activation, to avoid false lockouts.
- Pragmatic stance: signed, device‑bound, offline‑verifiable = **deterrence**, not unbreakable DRM. Clock‑tamper tolerance: store last‑seen time to detect rollback.

---

## E) Backup / Restore

Two complementary layers (both OS, identical engine):
- **Logical JSON backup** — the existing `erp_snapshot_company` / `erp_create_backup`; portable, inspectable, **platform‑agnostic** (the restore preview/apply already handles new/existing/conflict/skip, non‑destructive).
- **Physical PostgreSQL backup** — nightly `pg_dump -Fc` (custom format) for fastest full recovery; also OS‑agnostic as long as the **PG major version matches**.

**Targets (selectable, both OS):**
- **Local folder** — Windows `%PROGRAMDATA%\KakoRetail\backups`; macOS `~/Library/Application Support/KakoRetail/backups`.
- **External drive** — Windows drive letter; macOS `/Volumes/<drive>` (needs removable‑volume permission / Full Disk Access on recent macOS).
- **Network share** — SMB on both (Windows UNC `\\server\share`; macOS `/Volumes/<mount>`); credentials stored in the OS secret store.
- Optional AES‑256 encryption with a store passphrase; default: also keep one **off‑machine** copy (loud reminder if none configured).

**Cross‑machine restore matrix** — use **logical JSON** or **`pg_dump` custom format** (both portable). **Never** copy the raw `PGDATA` directory across OSes (it is platform/arch‑specific).

| Scenario | Mechanism | Notes |
|---|---|---|
| **Windows → Windows** | JSON restore, or `pg_dump`/`pg_restore`, or (same‑version) data‑dir copy | data‑dir copy OK only same OS + same PG version |
| **macOS → macOS** | JSON restore, or `pg_dump`/`pg_restore`, or (same‑version) data‑dir copy | data‑dir copy OK only same OS + same PG version |
| **Windows → macOS** | **JSON restore** (preferred) or `pg_restore` of the custom dump | **no data‑dir copy**; same PG major version |
| **macOS → Windows** | **JSON restore** (preferred) or `pg_restore` of the custom dump | **no data‑dir copy**; same PG major version |

> Guarantee cross‑OS portability by pinning the **same PostgreSQL major version** in every build and treating **logical JSON** as the canonical interchange format. The disaster‑recovery simulation already proves the JSON path restores all six entity types + inventory levels.

---

## F) Updates

- **Per‑OS update packages:** Windows EXE/MSI delta or full; macOS DMG/PKG (signed + notarized). Tauri's signed updater / electron‑updater handle download + verify when online.
- **Offline update file:** a signed `.update` bundle the customer applies from USB; the app verifies the signature offline before applying.
- **Update sequence (both OS):** stop Node + Postgres → **take a full `pg_dump` backup (mandatory pre‑update)** → swap the app build + (if changed) PG binaries → **run the migration chain to head** (idempotent) → restart → health‑check.
- **Rollback:** keep the previous app build + the pre‑update full backup; one‑click "Roll back last update" restores both. Migrations are forward‑only, so rollback = restore the pre‑update dump into the prior binaries.
- **Channels:** stable (default for stores) vs early; offline customers update on their own schedule.

---

## G) Hardware requirements

### Windows
| | Minimum | Recommended |
|---|---|---|
| OS | Windows 10 64‑bit | Windows 11 64‑bit |
| CPU | Dual‑core 2.0 GHz | Quad‑core |
| RAM | 4 GB | 8 GB |
| Disk | 5 GB free (SSD advised) | 20 GB SSD |
| Peripherals | Thermal printer (80/58 mm) + barcode scanner | + cash drawer, label printer |
| Backup | — | External drive / NAS for off‑machine copies |

### macOS
| | Minimum | Recommended |
|---|---|---|
| OS | macOS 12 Monterey | macOS 14+ |
| Chip | **Apple Silicon M1** (preferred) or Intel Core i5 (2019+) | Apple Silicon M2/M3 |
| RAM | 8 GB | 16 GB |
| Disk | 8 GB free (SSD) | 20 GB SSD |
| Peripherals | USB/Bluetooth thermal printer + scanner (verify macOS driver support) | + cash drawer |
| Backup | — | External drive (grant removable‑volume permission) / NAS |

LAN multi‑terminal (either OS): the "server" machine gets 16 GB RAM + SSD + wired LAN; other terminals are thin browsers pointed at it.

---

## H) Risks

| Risk | Platform | Impact | Mitigation |
|---|---|---|---|
| **Postgres bundling complexity** (arch slices, per‑binary signing) | macOS | **High** | Ship native arm64 + x86_64; **sign + hardened‑runtime + notarize every bundled binary**; automate in CI |
| Permissions & **notarization** of helper executables | macOS | High | `notarytool` + staple; entitlements; test on a clean machine (no dev tools) |
| **Antivirus / SmartScreen** flags unsigned `.exe` | Windows | Med‑High | EV code‑sign installer + all sidecars; build reputation; submit to MS if needed |
| **Gatekeeper** quarantines the app/sidecars | macOS | High | Full Developer ID signing + notarization + stapling; DMG also notarized |
| **Local service failure** (PG won't start / port taken / corrupt data dir) | both | High | Health check + auto‑retry; dynamic port; lock file; "repair" action (re‑init from last backup); clear tray status + logs |
| **Backup location permissions** (external/network) | both | Med | macOS removable‑volume / Full Disk Access prompts; Windows UNC creds; verify write before scheduling; warn if target unwritable |
| **Cross‑platform restore issues** (PG version mismatch, data‑dir non‑portability) | both | Med | Pin one PG major version; canonical **JSON**/`pg_restore` interchange; **block** raw data‑dir copy across OS in the UI |
| **Auth/RLS rewrite** (Supabase Auth → local) | both | Med | Keep RPCs; re‑implement only `auth.uid()`/`erp_user_company_id()`; single company simplifies it |
| **No off‑machine backup** → disk failure = total loss | both | High | Default off‑machine copy; loud reminder; two‑layer (JSON + `pg_dump`) |
| **Update on a live store** | both | Med | Mandatory pre‑update full backup; idempotent migrations; one‑click rollback |
| **macOS peripheral drivers** (some thermal printers/cash drawers are Windows‑first) | macOS | Med | Certify a supported hardware list before macOS GA |
| License false‑lockout (hardware change) | both | Low‑Med | Fuzzy fingerprint (tolerate one component change); easy re‑activation |

---

## I) Recommendation (clear answers)

1. **Electron or Tauri?** → **Tauri** for v1 (smaller installers for USB/offline installs, native tray/menu bar on both OS, smaller security surface, built‑in signed updater, good Windows‑signing + macOS‑notarization story). **Keep Electron as a documented fallback** — if Node‑sidecar packaging or per‑binary notarization proves painful, switch with low cost because Postgres + the Next.js server are shell‑agnostic sidecars either way.

2. **Same architecture on Windows and macOS?** → **Yes — the same logical architecture** (desktop shell + Node Next.js sidecar + bundled PostgreSQL sidecar + local auth + the same DB/migrations/backup engine). **Only the OS‑specific layers differ:** packaging (EXE/MSI vs DMG/PKG), service management (Windows Service vs LaunchAgent), signing (EV cert + SmartScreen vs Developer ID + notarization + Gatekeeper), and fingerprint sources. This keeps **one shared codebase** with thin per‑OS adapters.

3. **macOS in v1 or v1.1?** → **Windows ships first (v1); macOS in v1.1.** Reasons: larger retail install base on Windows, simpler signing, and a smaller hardware/driver matrix to certify. macOS adds real work (universal/arch binaries, hardened‑runtime + notarization of every bundled executable, peripheral‑driver certification). Prove the Windows offline stack end‑to‑end, then port to macOS — **Apple Silicon first**, **Intel only if the hardware/driver matrix justifies it** (ASi is the strategic target; Intel is "if feasible").

4. **Safest rollout plan**
   - **P0 – Cross‑platform spike (Windows):** Tauri shell + Node Next.js sidecar + bundled PG; first‑run bootstrap (initdb → migrate → seed company → local auth); POS happy path offline.
   - **P1 – Windows installer + licensing:** signed EXE/MSI, tray app, online + air‑gapped activation, signed license, fingerprint.
   - **P2 – Windows backup/restore hardening + pilot:** physical `pg_dump`, off‑machine copies, one‑click restore, update‑with‑backup‑and‑rollback; run a small store pilot; certify Windows peripherals.
   - **P3 – macOS Apple Silicon (v1.1):** universal/arm64 build, Developer ID signing + notarization of app **and every bundled binary**, DMG + LaunchAgent + menu‑bar app; verify the cross‑OS **JSON restore** path (W↔M) on real machines; certify macOS peripherals.
   - **P4 – macOS Intel (if feasible) + LAN multi‑terminal:** x86_64 slice; optional "server PC + thin clients" mode.
   - **Throughout:** one migration chain (CI already builds the DB from it), mandatory pre‑update backups, and the v1.1 backup/restore as the offline **and** cloud→offline migration engine.

**No offline implementation started — design/planning only, as instructed.**
