// ============================================================================
// Offline secrets — local JWT secret + PG password (Phase P3)
// ----------------------------------------------------------------------------
// The offline stack signs its JWTs and protects its local Postgres with secrets
// generated on first run and stored in the offline data dir with 0600
// permissions. A future hardening step can move these into the OS keystore
// (macOS Keychain / Windows Credential Manager); the file is the portable
// fallback. Server/script-side only.
// ============================================================================

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { offlinePaths } from './runtime';

export interface OfflineSecrets {
  /** HS256 secret PostgREST and the local issuer share. */
  jwtSecret: string;
  /** Local Postgres password (used once trust auth is replaced by md5/scram). */
  pgPassword: string;
}

type EnvLike = Record<string, string | undefined>;

/** Load the offline secrets, generating + persisting them on first call. */
export function loadOrCreateSecrets(
  dirName = 'Kako',
  platform: NodeJS.Platform = process.platform,
  env: EnvLike = process.env,
): OfflineSecrets {
  const { root, secretsFile } = offlinePaths(dirName, platform, env);

  if (fs.existsSync(secretsFile)) {
    const parsed = JSON.parse(fs.readFileSync(secretsFile, 'utf8')) as Partial<OfflineSecrets>;
    if (parsed.jwtSecret && parsed.pgPassword) return parsed as OfflineSecrets;
  }

  fs.mkdirSync(root, { recursive: true });
  const secrets: OfflineSecrets = {
    jwtSecret: randomBytes(48).toString('base64url'),
    pgPassword: randomBytes(24).toString('base64url'),
  };
  // Write 0600 so only the owner can read the signing secret.
  fs.writeFileSync(secretsFile, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  try { fs.chmodSync(secretsFile, 0o600); } catch { /* best-effort on Windows */ }
  return secrets;
}

/** Resolve only the JWT secret — honors KAKO_OFFLINE_JWT_SECRET (tests / CI /
 *  packaging) before falling back to the persisted file. */
export function jwtSecret(env: EnvLike = process.env): string {
  if (env.KAKO_OFFLINE_JWT_SECRET) return env.KAKO_OFFLINE_JWT_SECRET;
  return loadOrCreateSecrets('Kako', process.platform, env).jwtSecret;
}

export const SECRETS_FILENAME = path.basename(offlinePaths().secretsFile);
