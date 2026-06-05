# Offline Edition — Architecture Plan (design only)

**Status:** planning / design. **No implementation in this document.**
**Goal:** run the Retail Edition (Fashion/POS store) fully on a single Windows PC with **no internet dependency**, while keeping one codebase with the cloud (SaaS) edition.

Current cloud stack (for reference): Next.js 15 (App Router, server components + server actions), Supabase Postgres 17 + RLS, pg_cron (scheduled backups), a per‑company multi‑tenant model. The retail tenant uses business_type `clothing` → `fashion` module.

---

## 1. SQLite vs PostgreSQL for local deployment

| Dimension | **PostgreSQL (embedded/local service)** | **SQLite (embedded file)** |
|---|---|---|
| Compatibility with current schema | **Native** — same DDL, RPCs (plpgsql), triggers, RLS, `jsonb`, sequences, `pg_cron` | Requires rewriting all `plpgsql` RPCs (we have ~25: checkout, void, returns, exchange, installments, analytics, backups…), triggers, and RLS → large port |
| RLS / multi‑tenant | Yes (but a single store needs only company‑scoping, not full RLS) | No RLS — enforce scope in app |
| Concurrency | Multiple cashiers/terminals on a LAN | Single‑writer; fine for **one** terminal, risky for multi‑terminal |
| Footprint / ops | Heavier (a Windows service, ~200MB) | Tiny (one file, zero service) |
| Backup/restore | `pg_dump`/file copy; our snapshot RPC works as‑is | Copy the `.sqlite` file |
| Effort to reach parity | **Low–medium** (reuse SQL) | **High** (port every RPC/trigger) |

### Recommendation
**Embedded PostgreSQL** (bundled `postgresql` binaries run as a local Windows service on `127.0.0.1`). Rationale:
- **Reuse the entire existing SQL layer** — RPCs, triggers, the analytics/backup functions, the migration chain (0001→0173) — with near‑zero rewrite. This is the single biggest risk‑reducer.
- Supports a **2–3 terminal LAN** store later (one PC as the “server”, others as clients) without re‑architecting.
- `pg_cron` → local scheduled backups already work.

> SQLite remains a fallback **only** if we must ship an ultra‑light single‑terminal build and accept a full SQL port. Not recommended for v1.

### Deployment shape (recommended)
- **App:** package the Next.js app as a local server (Node runtime) started by the installer, served at `http://localhost:<port>`, opened in the default browser **or** wrapped in a thin desktop shell (Tauri/Electron) for a native window + tray.
- **DB:** bundled Postgres service, data dir under `%PROGRAMDATA%\KakoRetail\db`.
- **Auth offline:** replace Supabase Auth with a **local auth** (bcrypt users table + a signed local session cookie). `auth.uid()`/`erp_user_company_id()` are re‑pointed to a local session function. Single company seeded at install.

---

## 2. Windows installer

- **Installer:** MSI/EXE via **Inno Setup** or **WiX** (or Tauri's bundler if we use a Tauri shell).
- **Bundles:** the app (Node + built `.next`), the Postgres binaries, a first‑run bootstrap that (a) `initdb`s the data dir, (b) starts the service, (c) runs the migration chain, (d) seeds the company + admin user + a license check.
- **Services:** register Postgres + the app as Windows services (auto‑start) via `sc.exe`/NSSM; a **system‑tray** app for start/stop/status/backup‑now.
- **Ports:** bind to `127.0.0.1` only by default; LAN mode opens the chosen port via a firewall rule the installer adds on explicit opt‑in.
- **Uninstall:** keep the DB data dir + backups by default (ask before deleting).
- **Code signing:** sign the installer + binaries (EV cert) to avoid SmartScreen warnings.

---

## 3. Licensing model

- **Per‑device perpetual license + optional annual support/updates** (typical for offline POS), or **annual subscription** with a grace period. Recommend **per‑device license key** tied to a hardware fingerprint.
- **License key:** a signed token (Ed25519/RSA) issued by our licensing server, embedding: license id, edition, device‑binding flag, issue/expiry, feature flags (e.g. number of terminals).
- **Validation:** the app verifies the signature **offline** with an embedded public key (no server call needed to run). Expiry/feature‑gating enforced locally.
- **Anti‑piracy (pragmatic, not DRM‑heavy):** bind to a hardware fingerprint (motherboard/disk serial hash); allow N re‑activations; tamper‑evident, not unbreakable.

---

## 4. Offline activation

- **Online activation (preferred when available):** enter key → app contacts licensing server once → server returns a signed, device‑bound license file stored locally. Subsequent launches are 100% offline.
- **Fully offline activation (air‑gapped):**
  1. App shows a **Request Code** (hardware fingerprint + key).
  2. Customer sends it to us (phone/WhatsApp/email).
  3. We return an **Activation Code** (signed license file / short code).
  4. App verifies the signature offline and activates.
- **Reactivation/transfer:** a deactivate flow frees a seat; new device requests a fresh activation. Store a small local audit of activations.

---

## 5. Local backups

- **Reuse the existing model directly:** `erp_create_backup()` + `erp_snapshot_company()` already produce a self‑contained JSON snapshot per company — works unchanged on local Postgres.
- **Scheduling:** local `pg_cron` runs `erp_run_scheduled_backups()` daily; the Settings → Backup UI already exposes frequency/retention/Backup‑Now/download.
- **Storage targets:** write backups to (a) the local DB (`erp_backups`, retained), and (b) a **file** under `%PROGRAMDATA%\KakoRetail\backups\` (plus optional copy to a chosen folder / USB / network share).
- **Belt‑and‑braces:** also schedule a nightly `pg_dump` (full physical backup) alongside the JSON logical snapshot — physical is the fastest full recovery, JSON is portable/inspectable.
- **Encryption:** optional AES‑256 of backup files with a store passphrase.

---

## 6. Restore strategy

- **Logical (data) restore:** the **already‑built** restore preview/apply (new/existing/conflict/skip, non‑destructive, explicit confirm) works locally as‑is — this is the everyday "recover a record / migrate data" path. (Proven by the disaster‑recovery simulation.)
- **Full physical restore (catastrophic):** stop the service → replace the data dir from a `pg_dump`/file backup → restart → run any pending migrations. Wrapped in a one‑click "Restore from full backup" tray action with confirmation.
- **Cross‑machine restore (PC replacement):** copy the latest backup file → install on the new PC → restore. Same flow as cloud→offline migration (§8).
- **Integrity:** verify snapshot `meta.version`/checksum before applying; keep the last good backup before overwriting.

---

## 7. Update strategy

- **App updates:** ship a new installer; a tray "Check for updates" pulls a signed update package (when online) or applies a provided update file (offline). Updater stops services, swaps the app build, **runs the migration chain to head**, restarts. Always backup (full `pg_dump`) before migrating.
- **Migrations:** the linear `supabase/migrations/000x_*.sql` chain is the source of truth; the local bootstrap/updater applies any not‑yet‑applied files (tracked in a local `schema_migrations`). Our migrations are already **idempotent**, which de‑risks re‑runs.
- **Rollback:** keep the pre‑update full backup + the previous app build for one‑click rollback.
- **Channels:** stable (default) vs. early; offline customers stay on stable and update on their schedule.

---

## 8. Data migration: cloud → offline

1. **Export from cloud:** Settings → Backup → Download (existing JSON snapshot) — or a richer export job for very large books.
2. **Install offline edition** → bootstrap creates the local company.
3. **Import:** the restore preview/apply ingests the cloud snapshot (master data + inventory + invoices/installments insert‑missing). Show the same new/existing/conflict/skip preview before applying.
4. **Reconcile:** verify counts + balances; print a migration report (before/after counts) — same pattern as the disaster‑recovery report.
5. **Cutover:** mark the cloud tenant read‑only (or export‑and‑freeze) to avoid divergence; from then on the store is offline‑authoritative.

> **Offline → cloud (future sync):** out of scope for v1. If later needed, add a change‑log (outbox) table + a one‑way push, or a CRDT/last‑write‑wins sync layer. Designing for an `updated_at`/`id`‑keyed merge now keeps that door open.

---

## 9. Hardware requirements (single‑terminal store)

| | Minimum | Recommended |
|---|---|---|
| OS | Windows 10/11 64‑bit | Windows 11 64‑bit |
| CPU | Dual‑core 2.0GHz | Quad‑core |
| RAM | 4 GB | 8 GB |
| Disk | 5 GB free (SSD advised) | 20 GB SSD (room for years of backups) |
| Peripherals | Thermal printer (80/58mm) + USB/Bluetooth barcode scanner | + cash drawer, label printer |
| Backup media | — | External drive / USB / NAS for off‑machine backup copies |

LAN (multi‑terminal): the "server" PC gets 8–16 GB RAM + SSD + wired LAN; clients are thin browsers pointing at the server.

---

## 10. Risks & recommendations

| Risk | Impact | Mitigation |
|---|---|---|
| **Auth/RLS rewrite** (Supabase Auth → local) | Medium | Keep RPCs; re‑implement only `auth.uid()` / `erp_user_company_id()` as local‑session functions; single company simplifies scoping |
| **No off‑machine backups** → disk failure = total loss | **High** | Default nightly copy to USB/NAS; loud UI reminder; physical `pg_dump` + logical JSON |
| **Bundling Postgres on Windows** (service mgmt, ports, perms) | Medium | Use proven binaries + NSSM; bind localhost; thorough first‑run bootstrap + health checks |
| **Update/migration on a live store** | Medium | Always full backup pre‑update; idempotent migrations; one‑click rollback to prior build + backup |
| **License piracy / clock tampering** | Low–med | Signed device‑bound license, offline verify; accept it's deterrence, not DRM |
| **Code‑signing / SmartScreen** | Low | EV cert; sign installer + binaries |
| **Schema drift cloud vs offline** | Medium | Single migration chain is the source of truth for both editions; CI builds the DB from it (already in place) |
| **Multi‑terminal write conflicts** (if LAN) | Medium | Postgres handles it; keep SQLite off the table for multi‑terminal |
| **Large backup size** (JSON of full history) | Low | Retention pruning (built); add `pg_dump` for full; optional compression |

### Headline recommendations
1. **Embedded PostgreSQL**, not SQLite — reuse the whole SQL/RPC/migration layer; biggest risk reducer.
2. **Reuse the v1.1 backup/restore** as the offline backup + cloud→offline migration engine (already proven by the disaster‑recovery simulation).
3. **Offline‑verifiable signed licenses** with online + air‑gapped activation.
4. **Two‑layer backups** (logical JSON + physical `pg_dump`), with **default off‑machine copies**.
5. **One migration chain, two editions**; idempotent migrations + pre‑update full backup + rollback.
6. Wrap in a **tray app / thin desktop shell** for start/stop/status/backup; sign everything.

---

## Suggested phasing (when approved)
- **P0 – Spike:** bundle Postgres + Node app on Windows; bootstrap + run migrations; local auth; POS happy path offline.
- **P1 – Installer + licensing:** Inno/WiX installer, signed; offline + air‑gapped activation; tray app.
- **P2 – Backup/restore hardening:** physical `pg_dump`, off‑machine copies, one‑click restore; cloud→offline migration wizard reusing the restore preview.
- **P3 – Updates:** signed update packages, migrate‑to‑head with backup + rollback; (optional) LAN multi‑terminal.
