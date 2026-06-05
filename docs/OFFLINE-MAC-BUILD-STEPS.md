# Build & Verify the First Native Offline App — macOS (Apple Silicon)

Exact steps to run on your Mac to produce and validate the first native VANTORA
Offline build. Order matches the program: prove the headless stack first, then
the Tauri app, then signing.

## 0. Prerequisites (one-time)

```bash
# Toolchains
xcode-select --install                         # Xcode Command Line Tools
brew install rustup-init && rustup-init -y      # Rust (Tauri needs it)
brew install node@22                            # Node 22 (or use your nvm)
npm i -g @tauri-apps/cli                         # tauri CLI

# Repo
git clone <repo> && cd Kako
git checkout claude/clinic-project-continuation-PqxGD
npm ci
```

## 1. Prove the headless offline stack (no Tauri yet)

This uses the bundled-script path against a **local PostgreSQL 17** on your Mac.

```bash
# Install PG17 just to get binaries for the bootstrap test:
brew install postgresql@17
export KAKO_PG_BIN="$(brew --prefix postgresql@17)/bin"

export KAKO_OFFLINE=1 KAKO_EDITION=retail

# A) Runtime verification (throwaway cluster): boot → migrate → seed → RLS → bcrypt
npm run offline:verify          # expect: ✓ offline runtime verification PASSED

# B) Recovery certification on real PG17 (the on-hardware cert run)
npm run offline:cert            # expect: ✓ RECOVERY CERTIFIED
#   → regenerates docs/OFFLINE-RECOVERY-CERTIFICATION.md with OS = darwin arm64

# C) First real store + a manual look:
npm run offline:bootstrap       # initdb → migrate-to-head → seed (running PG)
#   admin: admin@kako.local / admin   (override with KAKO_OFFLINE_ADMIN_*)
```

> On a normal user account (not root) you do **not** need `KAKO_PG_RUNAS`.

## 2. Stage the sidecars for the Tauri bundle

```bash
# Copies app scripts + migrations into src-tauri/resources and tells you exactly
# where to drop the three arm64 binaries:
scripts/offline/macos/fetch-binaries.sh arm64

# Then, as the script prints:
#  - copy PG17 bin/lib/share  → src-tauri/resources/pgsql/
#  - cp resources/pgsql/bin/postgres  src-tauri/binaries/postgres-aarch64-apple-darwin
#  - download PostgREST (aarch64) → src-tauri/binaries/postgrest-aarch64-apple-darwin
#  - cp "$(command -v node)"      → src-tauri/binaries/node-aarch64-apple-darwin
```

## 3. Build + run the Tauri app (dev, unsigned)

```bash
export KAKO_OFFLINE=1 KAKO_EDITION=retail
npm run build                    # standalone Next server (frontendDist)
npx tauri dev                    # launches the shell; supervisor boots the stack
```

**Expected:** the window appears only after the local stack is healthy; you can
log in (admin@kako.local), make a **cash sale** and an **installment sale**,
print an 80mm receipt, run **Backup Now**, and **restore** a modified copy — all
with **no network** (verify with Little Snitch or `nettop`).

> P1 runtime wiring you'll complete here: the `/auth/v1` + `/rest/v1` proxy in the
> Next server (point `NEXT_PUBLIC_SUPABASE_URL` at the local gateway) and the
> activation/login screen. The auth + license cores are already verified.

## 4. License a device (optional, to test activation)

```bash
node licensing-server/issue.mjs keygen           # one-time; prints the PUBLIC key
# Get <FP> from the app's activation screen (or device_fingerprint command), then:
node licensing-server/issue.mjs issue \
  --edition retail --customer "My Store" --device <FP> --seats 1 --out license.json
# Set KAKO_LICENSE_PUBLIC_KEY to keys/public.pem contents and KAKO_REQUIRE_LICENSE=1.
```

## 5. Package + sign + notarize (release)

```bash
export KAKO_EDITION=retail
export APPLE_SIGNING_IDENTITY="Developer ID Application: <You> (<TEAMID>)"
export APPLE_ID="you@apple.com" APPLE_TEAM_ID="TEAMID" APPLE_APP_PASSWORD="app-specific-pw"
scripts/release/mac.sh           # build → deep-sign every binary → notarize → staple
```

**Expected:** a signed, notarized `.dmg` that installs and launches on a **clean**
Apple-Silicon Mac with **no Gatekeeper warning**, runs the offline POS, and makes
no network calls after launch.

## 6. Report back

After step 1 (B) and step 3, send me:
- the `docs/OFFLINE-RECOVERY-CERTIFICATION.md` regenerated on `darwin arm64`, and
- whether the Tauri window came up healthy + the cash/installment sale + backup/
  restore worked.

I'll then (a) finish the P1 runtime proxy/login wiring against your results, and
(b) proceed to P2 (Windows) and P6/P7 hardening.
