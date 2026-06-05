# Offline Licensing — Readiness Report

**Status:** licensing core implemented and fully unit-verified (26 tests). The
app is **verify-only** (embeds the public key); signing lives only on the
licensing server. v1 enforces a single terminal, but the document + verifier
carry the full commercial model so expansion is server-side issuance, not an app
change.

## What is implemented & verified

| Capability | Module | Verified |
|---|---|---|
| Ed25519 sign/verify over canonical JSON | `license/sign.ts` | valid/tampered/wrong-key |
| License document (full model) | `license/types.ts` | — |
| Launch verifier (signature, edition, expiry, **terminal cap**, device seat) | `license/verify.ts` | cap at **1 and N**, N+1 rejected; edition mismatch; expiry; device-not-activated |
| Install (activation/upgrade/renewal/transfer = newer signed license) | `license/activate.ts` | newer installs; replay/downgrade rejected; transfer drops old seat; forged rejected |
| Device fingerprint (salted; raw never stored) + drift tolerance | `license/fingerprint.ts` | stable, salted, fuzzy match (one component change) |
| Local store (persist + recheck on load, fail closed) | `license/store.ts` | tamper-on-disk rejected |
| Dev issuer (keygen + issue) | `licensing-server/issue.mjs` | issuer↔verifier agreement confirmed end-to-end |

## Commercial model (designed in from v1)

| Field | v1 | Later (issuance-only) |
|---|---|---|
| `customerId` | one customer | per-customer licensing |
| `edition` + `productCode` | retail | any VANTORA edition (brand binding) |
| `activations[]` (device seats) | 1 device | N devices |
| `maxTerminals` | **1, enforced** | N — verifier already honors |
| `tier` + `validUntil` | standard / perpetual | paid upgrades / subscription |
| `storeGroupId` | unused | multi-store chains (per-store sub-licenses) |
| `version` | 1 | bumped on every re-issue (replay-proof) |

Activation, paid upgrade, renewal and transfer are all **a newer signed
license**; the device installs whichever validly-signed license is newer and
re-checks the cap + its seat at every launch.

## Activation flows

- **Online:** app builds an `ActivationRequest` (licenseId + edition + device
  fingerprint + current version) → POST to the licensing server → receives the
  signed license → `installLicense` verifies + stores it → launches offline with
  no further network.
- **Air-gapped:** the request is shown as a code; the server's signed response is
  pasted back. Same verification.
- **Transfer:** the server re-issues (version bumped) without the old device; on
  the old device the next launch sees `device-not-activated` (seat freed).

## Enforcement posture

- `KAKO_REQUIRE_LICENSE` gates enforcement (the spike can run with it off).
- v1 ships `maxTerminals = 1` **enforced** — multi-terminal stays dormant but
  present so we don't sell seats we haven't field-tested.
- Seat reconciliation for chains/multi-terminal is a server concern (the device
  only knows its own license); periodic online re-validation reconciles.

## Pending (hardware)

- Raw device-fingerprint collection is the Tauri shell's job
  (`src-tauri/src/fingerprint.rs`, scaffolded): macOS `IOPlatformUUID`, Windows
  `MachineGuid` + SMBIOS UUID. The Node salt/hash/verify layer is done + tested.
- The activation UI (key entry, request/activation codes, seat usage) is wired in
  the P1 runtime spike.
- Embed the production public key via `KAKO_LICENSE_PUBLIC_KEY` at build time.
