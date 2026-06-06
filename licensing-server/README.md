# Licensing Server (Phase P4)

**Out of the app bundle.** Holds the Ed25519 **private key** and issues signed
licenses + upgrade/renewal re-issues. The offline app embeds only the **public
key** and is strictly **verify-only** — it never signs, so there is no signing
key on customer devices.

## Commercial model (designed in from v1)

The signed license document (`src/lib/license/types.ts`) carries the full model
even though v1 enforces a single terminal:

| Field | Purpose | v1 | Later (issuance-only change) |
|---|---|---|---|
| `customerId` | per-customer licensing | one customer | unchanged |
| `edition` + `productCode` | edition-based licensing / brand binding | retail | any VANTORA edition |
| `activations[]` | per-device seats (salted fingerprint) | 1 device | N devices |
| `maxTerminals` | terminal/seat cap | `1` (enforced) | `N` (verifier already honors) |
| `tier` + `validUntil` | paid upgrades / subscription expiry | standard / perpetual | re-issue raises tier/expiry |
| `storeGroupId` | multi-store chains | unused | per-store sub-licenses |
| `version` | replay/downgrade protection | 1 | bumped on every re-issue |

**Activation, upgrade, renewal, transfer are all just a newer signed license**
(`version` bumped). The app installs whichever validly-signed license is newer
(`installLicense`) and re-checks the cap + device seat at every launch
(`verifyLicense`). Expanding the model is a server-side issuance change, never an
app re-architecture.

## Dev usage (for the macOS / Windows validation builds)

```bash
# One-time: generate the signing keypair (private stays here; embed the public).
node licensing-server/issue.mjs keygen

# Issue a single-terminal retail license bound to a device fingerprint:
node licensing-server/issue.mjs issue \
  --edition retail --customer "Acme Store" \
  --device <DEVICE_FINGERPRINT> --seats 1 --out license.json
```

- Get `<DEVICE_FINGERPRINT>` from the app's activation screen (P1 wires it to the
  Tauri fingerprint command).
- Online activation: the app POSTs an `ActivationRequest`; the server responds
  with `license.json`. Air-gapped: the request/response are shown as codes.
- The embedded public key is provided to the app via `KAKO_LICENSE_PUBLIC_KEY`
  (build-time) — see `keys/public.pem` after `keygen`.

## Production notes (not built here)

- Private key in an HSM / KMS; issuance behind authn + audit.
- Seat reconciliation for multi-terminal/chains happens here (the device only
  knows its own license); periodic online re-validation reconciles seats.
- `keys/` is git-ignored (never commit a private key).
