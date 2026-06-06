# Release Secrets — setup for signed CI builds

> The release workflow (`.github/workflows/release.yml`) needs the Tauri updater
> signing key to build. Until it's added, the build fails at the signing step.
> Apple notarization secrets are separate and deferred.

## Required now — Tauri updater signing (Ed25519)

The keypair was generated locally (`tauri signer generate`). The **private** key
lives only at `src-tauri/.tauri-private-key.pem` (gitignored — never committed);
the **public** key is embedded in `tauri.conf.json`.

Add two repository secrets (GitHub → repo → Settings → Secrets and variables →
Actions → New repository secret):

| Secret name | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | the full contents of `src-tauri/.tauri-private-key.pem` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | empty string (the key was generated with no passphrase) |

Print the private key for copy-paste:

```bash
cat src-tauri/.tauri-private-key.pem
```

If you use the GitHub CLI:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < src-tauri/.tauri-private-key.pem
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""
```

> Why this can't be scripted from here: GitHub's secrets API requires the value
> encrypted with the repo's libsodium public key (sealed box); the tooling for
> that isn't available in this environment, so set it via the UI or `gh` above.

## Required before the first SIGNED/NOTARIZED macOS release (deferred)

Without these, the build still completes but the app is only ad-hoc signed
(Gatekeeper will warn; right-click → Open to run locally). For distribution:

| Secret | What |
|---|---|
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: <Name> (TEAMID)` |
| `APPLE_CERTIFICATE` | base64 of the Developer ID `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_ID` | Apple account email (notarization) |
| `APPLE_PASSWORD` | app-specific password |
| `APPLE_TEAM_ID` | 10-char team id |

The workflow references these and **skips** notarization when they're absent, so
it won't fail without them.
