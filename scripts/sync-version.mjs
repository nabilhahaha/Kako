#!/usr/bin/env node
// ============================================================================
// Version single-source-of-truth sync
// ----------------------------------------------------------------------------
//   node scripts/sync-version.mjs            # propagate package.json → tauri/cargo
//   node scripts/sync-version.mjs --set X    # bump package.json to X, then propagate
//   node scripts/sync-version.mjs --check    # exit 1 if the three are out of sync
//
// Root package.json `version` is the ONE source of truth; this propagates it to
// src-tauri/tauri.conf.json (`version`) and src-tauri/Cargo.toml ([package]
// version). Standard semver, beta pre-release suffix (e.g. 1.4.0-beta.2) — both
// targets accept pre-release. CI runs `--check` so a release can never ship
// mismatched versions. See docs/offline/auto-update.md §6.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = path.join(ROOT, 'package.json');
const CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const CARGO = path.join(ROOT, 'src-tauri', 'Cargo.toml');

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const check = process.argv.includes('--check');
const setTo = arg('set');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Read the [package] version from Cargo.toml (first `version = "..."` inside the
 *  [package] table, before the next [section]). */
function readCargoVersion(text) {
  const lines = text.split('\n');
  let inPkg = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('[')) inPkg = t === '[package]';
    else if (inPkg) {
      const m = t.match(/^version\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    }
  }
  return null;
}

function writeCargoVersion(text, version) {
  const lines = text.split('\n');
  let inPkg = false;
  let done = false;
  const out = lines.map((line) => {
    const t = line.trim();
    if (t.startsWith('[')) {
      inPkg = t === '[package]';
      return line;
    }
    if (inPkg && !done && /^version\s*=\s*"[^"]+"/.test(t)) {
      done = true;
      return line.replace(/version\s*=\s*"[^"]+"/, `version = "${version}"`);
    }
    return line;
  });
  if (!done) throw new Error('could not find [package] version in Cargo.toml');
  return out.join('\n');
}

// 1. Resolve the source version.
const pkg = readJson(PKG);
let version = pkg.version;
if (setTo) {
  if (!SEMVER.test(setTo)) {
    console.error(`✗ not a valid semver: ${setTo}`);
    process.exit(2);
  }
  version = setTo;
  if (!check) {
    pkg.version = version;
    fs.writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`› package.json → ${version}`);
  }
}
if (!SEMVER.test(version)) {
  console.error(`✗ package.json version is not valid semver: ${version}`);
  process.exit(2);
}

// 2. Read current targets.
const conf = readJson(CONF);
const cargoText = fs.readFileSync(CARGO, 'utf8');
const cargoVersion = readCargoVersion(cargoText);

// 3. Check mode: compare and report.
if (check) {
  const mism = [];
  if (conf.version !== version) mism.push(`tauri.conf.json=${conf.version}`);
  if (cargoVersion !== version) mism.push(`Cargo.toml=${cargoVersion}`);
  if (mism.length) {
    console.error(`✗ version mismatch (package.json=${version}): ${mism.join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ versions in sync: ${version}`);
  process.exit(0);
}

// 4. Propagate.
if (conf.version !== version) {
  conf.version = version;
  fs.writeFileSync(CONF, `${JSON.stringify(conf, null, 2)}\n`);
  console.log(`› tauri.conf.json → ${version}`);
}
if (cargoVersion !== version) {
  fs.writeFileSync(CARGO, writeCargoVersion(cargoText, version));
  console.log(`› Cargo.toml → ${version}`);
}
console.log(`✓ synced to ${version}`);
