#!/usr/bin/env node
// ============================================================================
// Offline app build (tauri beforeBuildCommand for the offline edition).
// ----------------------------------------------------------------------------
// 1. Bakes the offline data-layer env so the Next client bundle targets the
//    LOCAL gateway (NEXT_PUBLIC_SUPABASE_URL = the app origin :54331, which the
//    app's own /rest/v1 + /auth/v1 routes proxy to PostgREST + the local issuer)
//    with a matching anon key.
// 2. Builds Next (output: 'standalone' is gated on KAKO_OFFLINE in next.config).
// 3. Stages the standalone server (+ .next/static + public, which Next omits)
//    into src-tauri/resources/next-standalone for bundling.
// 4. Writes the per-build JWT secret + anon key to bundled files the Tauri shell
//    injects at runtime (src-tauri/src/main.rs), so build and runtime agree on
//    the secret PostgREST/auth verify.
//
// Per-build (not in the repo) secret: still extractable from the installed app,
// but the offline box is single-tenant + local, so a shared-per-build secret is
// an accepted BETA simplification (a per-install secret needs runtime anon-key
// delivery — a follow-up).
// ============================================================================

import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RES = path.join(ROOT, 'src-tauri', 'resources');
const APP_URL = process.env.KAKO_OFFLINE_URL || 'http://127.0.0.1:54331';

// Per-build offline JWT secret + matching anon JWT (role=anon, HS256) — same
// algorithm as scripts/offline/anon-key.mjs and src/lib/offline/jwt.ts.
const secret = process.env.KAKO_OFFLINE_JWT_SECRET || randomBytes(48).toString('base64url');
const b64 = (b) => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = b64(JSON.stringify({ role: 'anon', iss: 'kako-offline', iat: now, exp: now + 10 * 365 * 24 * 3600 }));
const anonKey = `${header}.${payload}.${b64(createHmac('sha256', secret).update(`${header}.${payload}`).digest())}`;

const buildEnv = {
  ...process.env,
  KAKO_OFFLINE: '1',
  KAKO_OFFLINE_JWT_SECRET: secret,
  NEXT_PUBLIC_SUPABASE_URL: APP_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
};

console.log('› offline Next build (standalone, local gateway baked)');
const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: buildEnv, cwd: ROOT });
if (r.status !== 0) process.exit(r.status ?? 1);

// Stage the standalone server. Next's standalone output omits .next/static and
// public — copy them in so the bundled server serves assets.
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const SERVER = path.join(STANDALONE, 'server.js');
if (!fs.existsSync(SERVER)) {
  console.error(`✗ standalone server not found at ${SERVER} (is output:'standalone' active?)`);
  process.exit(1);
}
const DEST = path.join(RES, 'next-standalone');
console.log('› staging Next standalone → resources/next-standalone');
fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(STANDALONE, DEST, { recursive: true });
fs.cpSync(path.join(ROOT, '.next', 'static'), path.join(DEST, '.next', 'static'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'public'))) {
  fs.cpSync(path.join(ROOT, 'public'), path.join(DEST, 'public'), { recursive: true });
}

// Runtime secret + anon key the shell reads + injects (gitignored, bundled).
fs.mkdirSync(RES, { recursive: true });
fs.writeFileSync(path.join(RES, 'offline-jwt-secret.txt'), secret, { mode: 0o600 });
fs.writeFileSync(path.join(RES, 'anon-key.txt'), anonKey);
console.log('✓ offline build staged (standalone + secret + anon key)');
