#!/usr/bin/env node
// ============================================================================
// Offline anon key — print a PostgREST-trusted anonymous JWT (role=anon)
// ----------------------------------------------------------------------------
//   KAKO_OFFLINE_JWT_SECRET=… node scripts/offline/anon-key.mjs
// supabase-js needs an anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) it sends as the
// pre-login bearer. Offline, that must be a JWT with role=anon signed by the
// SAME local secret PostgREST verifies — so PostgREST maps it to the anon role.
// HS256 to match src/lib/offline/jwt.ts.
// ============================================================================

import { createHmac } from 'node:crypto';

const secret = process.env.KAKO_OFFLINE_JWT_SECRET;
if (!secret) { process.stderr.write('✗ set KAKO_OFFLINE_JWT_SECRET\n'); process.exit(1); }

const b64 = (b) => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = b64(JSON.stringify({ role: 'anon', iss: 'kako-offline', iat: now, exp: now + 10 * 365 * 24 * 3600 }));
const sig = b64(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
process.stdout.write(`${header}.${payload}.${sig}`);
