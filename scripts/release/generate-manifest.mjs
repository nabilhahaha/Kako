#!/usr/bin/env node
// ============================================================================
// Tauri updater manifest generator (CI)
// ----------------------------------------------------------------------------
// Emits a per-target updater manifest the desktop app fetches at
//   .../releases/download/updates-<channel>/latest-<os>-<arch>.json
// Each matrix arch writes its own file containing its own platform slot plus the
// shared admin fields; the plugin only reads the slot matching the running
// target, so per-arch files compose cleanly without cross-job coordination.
//
//   node scripts/release/generate-manifest.mjs \
//     --version 1.4.0 --channel stable --os darwin --arch aarch64 \
//     --url https://github.com/owner/repo/releases/download/v1.4.0/App_1.4.0_aarch64.app.tar.gz \
//     --sig-file path/to/App.app.tar.gz.sig \
//     --notes-file RELEASE_NOTES.md \
//     --min-supported 1.2.0 --denied 1.3.4,1.3.5 \
//     --pub-date 2026-06-06T12:00:00Z \
//     --out latest-darwin-aarch64.json
//
// Schema + field contract: docs/offline/auto-update.md §5.
// ============================================================================

import fs from 'node:fs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const version = arg('version');
const channel = arg('channel', 'stable');
const os = arg('os'); // darwin | windows
const arch = arg('arch'); // aarch64 | x86_64
const url = arg('url');
const sigInline = arg('signature');
const sigFile = arg('sig-file');
const notesFile = arg('notes-file');
const notesInline = arg('notes');
const minSupported = arg('min-supported', '');
const denied = arg('denied', ''); // comma-separated
const pubDate = arg('pub-date', new Date().toISOString());
const out = arg('out');

for (const [k, v] of Object.entries({ version, channel, os, arch, url, out })) {
  if (!v) {
    console.error(`✗ missing required --${k}`);
    process.exit(2);
  }
}
if (channel !== 'stable' && channel !== 'beta') {
  console.error(`✗ channel must be stable|beta, got: ${channel}`);
  process.exit(2);
}

const signature = sigInline ?? (sigFile ? fs.readFileSync(sigFile, 'utf8').trim() : '');
if (!signature) {
  console.error('✗ no signature provided (--signature or --sig-file)');
  process.exit(2);
}

const releaseNotes = notesInline ?? (notesFile && fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8') : '');
const deniedVersions = denied ? denied.split(',').map((s) => s.trim()).filter(Boolean) : [];

const manifest = {
  version,
  channel,
  pub_date: pubDate,
  min_supported_version: minSupported || undefined,
  denied_versions: deniedVersions,
  release_notes: releaseNotes,
  // `notes` mirrors release_notes for plugin-native rendering; admin fields are
  // read by our Rust layer from raw_json.
  notes: releaseNotes,
  platforms: {
    [`${os}-${arch}`]: { url, signature },
  },
};
// Drop undefined keys for a clean manifest.
if (manifest.min_supported_version === undefined) delete manifest.min_supported_version;

fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`› wrote ${out} (${os}-${arch}, ${channel}, v${version})`);
