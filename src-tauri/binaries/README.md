# Bundled sidecar binaries (P1 macOS / P2 Windows)

Tauri's `externalBin` requires each binary suffixed with the **target triple**.
Place per-target builds here before `tauri build`:

```
postgres-aarch64-apple-darwin        postgres-x86_64-pc-windows-msvc.exe
postgrest-aarch64-apple-darwin       postgrest-x86_64-pc-windows-msvc.exe
node-aarch64-apple-darwin            node-x86_64-pc-windows-msvc.exe
```

(`postgres` is the wrapper that finds `initdb`/`pg_ctl`/`pg_dump` in the bundled
PostgreSQL 17 dir — the full PG bin/lib/share tree is shipped under
`resources/pgsql/` and pointed to via `KAKO_PG_BIN`.)

Fetch/repackage helpers:
- macOS (Apple Silicon first): `scripts/offline/macos/fetch-binaries.sh`
- Windows: `scripts/offline/windows/fetch-binaries.ps1`

**Do not commit the binaries** — they are large and license-bound. `.gitignore`
excludes everything here except this README.
