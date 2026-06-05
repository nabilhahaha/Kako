#!/usr/bin/env node
// ============================================================================
// Offline DB lifecycle (Phase P0): initdb / start / stop / status / health
// ----------------------------------------------------------------------------
//   node scripts/offline/db.mjs <init|start|stop|status|health>
// Wraps the bundled (or discovered) PostgreSQL: initializes a private cluster
// under the offline data dir, runs it on the offline port bound to localhost,
// and exposes health for the supervisor. Cross-platform (macOS/Windows/Linux).
// ============================================================================

import { offlinePaths, offlinePorts, pgConn, runPg, tryRunPg, ensureDir, log, fs, path } from './lib.mjs';

const paths = offlinePaths();
const ports = offlinePorts();
const conn = pgConn();

function pgRunning() {
  const r = tryRunPg('pg_ctl', ['status', '-D', paths.dataDir]);
  return r.ok;
}

function initdb() {
  if (fs.existsSync(path.join(paths.dataDir, 'PG_VERSION'))) { log(`data dir already initialized: ${paths.dataDir}`); return; }
  ensureDir(paths.root); ensureDir(paths.runDir); ensureDir(paths.backupsDir);
  log(`initdb → ${paths.dataDir}`);
  // Trust auth for the local owner on loopback only; the cluster never listens
  // off-box (listen_addresses set at start). UTF8 to match the cloud schema.
  runPg('initdb', ['-D', paths.dataDir, '-U', conn.user, '-E', 'UTF8', '--auth=trust', '--no-locale']);
  // Pin port + loopback-only + private socket dir into the cluster config.
  const conf = [
    ``,
    `# --- Kako offline overrides ---`,
    `port = ${ports.pg}`,
    `listen_addresses = '127.0.0.1'`,
    `unix_socket_directories = '${paths.runDir.replace(/\\/g, '/')}'`,
    `max_connections = 50`,
    `fsync = on`,
    ``,
  ].join('\n');
  fs.appendFileSync(path.join(paths.dataDir, 'postgresql.conf'), conf);
}

function start() {
  if (pgRunning()) { log('postgres already running'); return; }
  ensureDir(paths.runDir);
  log(`start postgres on 127.0.0.1:${ports.pg}`);
  runPg('pg_ctl', ['start', '-D', paths.dataDir, '-l', paths.logFile, '-w', '-t', '60']);
}

function stop() {
  if (!pgRunning()) { log('postgres not running'); return; }
  log('stop postgres');
  runPg('pg_ctl', ['stop', '-D', paths.dataDir, '-m', 'fast', '-w', '-t', '60']);
}

function status() {
  log(pgRunning() ? 'running' : 'stopped');
}

function health() {
  const r = tryRunPg('pg_isready', ['-h', conn.host, '-p', String(ports.pg), '-U', conn.user, '-d', conn.db]);
  process.stdout.write(`${r.out}\n`);
  if (!r.ok) process.exit(1);
}

const cmd = process.argv[2];
try {
  switch (cmd) {
    case 'init': initdb(); break;
    case 'start': start(); break;
    case 'stop': stop(); break;
    case 'status': status(); break;
    case 'health': health(); break;
    default:
      process.stderr.write('usage: db.mjs <init|start|stop|status|health>\n');
      process.exit(2);
  }
} catch (e) {
  process.stderr.write(`✗ ${e.message}\n`);
  process.exit(1);
}
