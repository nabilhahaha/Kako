#!/usr/bin/env node
// ============================================================================
// Offline migration runner (Phase P0)
// ----------------------------------------------------------------------------
//   node scripts/offline/migrate.mjs
// Applies the SAME migration chain the cloud/CI uses against the local cluster,
// tracked in a local `kako_schema_migrations` table so it is idempotent:
//   • first run: bootstrap (Supabase-compatible env) + legacy base + every
//     supabase/migrations/*.sql, in order.
//   • later runs: apply only migration files not yet recorded.
// One shared source of truth (supabase/migrations) for cloud AND offline.
// ============================================================================

import { SUPA_DIR, psql, psqlFile, psqlScalar, log, fs, path } from './lib.mjs';

const TRACK = 'kako_schema_migrations';

function ensureTrackTable() {
  psql(`CREATE TABLE IF NOT EXISTS ${TRACK} (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`);
}

function applied() {
  const out = psqlScalar(`SELECT coalesce(string_agg(filename, E'\\n' ORDER BY filename), '') FROM ${TRACK};`);
  return new Set(out ? out.split('\n') : []);
}

function record(filename) {
  psql(`INSERT INTO ${TRACK}(filename) VALUES ('${filename}') ON CONFLICT (filename) DO NOTHING;`);
}

function migrate() {
  const migrationsDir = path.join(SUPA_DIR, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  // First run = tracking table absent → lay down the Supabase-compatible env
  // and the legacy base exactly like CI does before the chain.
  const firstRun = psqlScalar(`SELECT to_regclass('public.${TRACK}') IS NULL;`) === 't';
  ensureTrackTable();

  if (firstRun) {
    log('bootstrap (Supabase env)');
    psqlFile(path.join(SUPA_DIR, 'ci', 'bootstrap.sql'));
    log('legacy app base');
    psqlFile(path.join(SUPA_DIR, 'ci', 'legacy-base.sql'));
  }

  const done = applied();
  let n = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    psqlFile(path.join(migrationsDir, f));
    record(f);
    n++;
  }
  log(firstRun ? `migrated to head (${files.length} migrations)` : `applied ${n} new migration(s); head has ${files.length}`);
}

try {
  migrate();
} catch (e) {
  process.stderr.write(`✗ migrate failed: ${e.message}\n`);
  process.exit(1);
}
