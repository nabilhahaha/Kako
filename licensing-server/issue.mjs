#!/usr/bin/env node
// ============================================================================
// Licensing server — dev issuer / signer (Phase P4, OUT of the app bundle)
// ----------------------------------------------------------------------------
// Holds the PRIVATE key and issues signed licenses. In production this lives on
// a secured server; this script is the local/dev equivalent used to issue test
// licenses for the macOS/Windows validation builds. The app only ever VERIFIES
// (embeds the public key) — it never signs.
//
//   node licensing-server/issue.mjs keygen
//   node licensing-server/issue.mjs issue --edition retail --customer C1 \
//        --device <fingerprint> [--seats 1] [--tier standard] \
//        [--until 2027-01-01T00:00:00Z] [--version 1] [--out license.json]
//
// Signing matches src/lib/license/sign.ts: Ed25519 over canonical (sorted-key)
// JSON, signature base64.
// ============================================================================

import { sign as edSign, generateKeyPairSync } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYS = path.join(HERE, 'keys');
const PRODUCT_CODE = { retail: 'VNT-RETAIL', pharmacy: 'VNT-PHARMACY', restaurant: 'VNT-RESTAURANT', fmcg: 'VNT-FMCG' };

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = sortDeep(v[k]);
    return o;
  }
  return v;
}
const canonicalize = (v) => JSON.stringify(sortDeep(v));

function keygen() {
  fs.mkdirSync(KEYS, { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(path.join(KEYS, 'private.pem'), privateKey, { mode: 0o600 });
  fs.writeFileSync(path.join(KEYS, 'public.pem'), publicKey);
  process.stdout.write(`✓ wrote ${KEYS}/private.pem (KEEP SECRET) + public.pem\n`);
  process.stdout.write(`\nEmbed this PUBLIC key in the app (KAKO_LICENSE_PUBLIC_KEY):\n\n${publicKey}\n`);
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

function issue() {
  const privPath = path.join(KEYS, 'private.pem');
  if (!fs.existsSync(privPath)) { process.stderr.write('✗ no private key — run: issue.mjs keygen\n'); process.exit(1); }
  const privateKey = fs.readFileSync(privPath, 'utf8');

  const edition = arg('edition', 'retail');
  if (!PRODUCT_CODE[edition]) { process.stderr.write(`✗ unknown edition ${edition}\n`); process.exit(1); }
  const device = arg('device');
  if (!device) { process.stderr.write('✗ --device <fingerprint> required\n'); process.exit(1); }

  const payload = {
    licenseId: arg('license', `lic-${randomUUID()}`),
    customerId: arg('customer', 'dev-customer'),
    edition,
    productCode: PRODUCT_CODE[edition],
    tier: arg('tier', 'standard'),
    issuedAt: new Date().toISOString(),
    validUntil: arg('until', null),
    maxTerminals: Number(arg('seats', '1')),
    activations: [{ deviceFingerprint: device, activatedAt: new Date().toISOString() }],
    features: {},
    version: Number(arg('version', '1')),
  };
  const signature = edSign(null, Buffer.from(canonicalize(payload), 'utf8'), privateKey).toString('base64');
  const license = { payload, signature };
  const out = arg('out');
  const json = JSON.stringify(license, null, 2);
  if (out) { fs.writeFileSync(out, json); process.stdout.write(`✓ wrote ${out}\n`); }
  else process.stdout.write(`${json}\n`);
}

const cmd = process.argv[2];
if (cmd === 'keygen') keygen();
else if (cmd === 'issue') issue();
else { process.stderr.write('usage: issue.mjs <keygen|issue ...>\n'); process.exit(2); }
