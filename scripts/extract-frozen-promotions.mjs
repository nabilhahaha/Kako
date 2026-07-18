#!/usr/bin/env node
/**
 * VERBATIM extractor for the frozen promotion engines.
 *
 * Slices exact line ranges out of roshen_settlement_platform.html (the
 * reference implementation — never modified) into ES modules under
 * src/lib/promotions/frozen/. Each generated file is:
 *
 *   header comment  +  imports  +  BEGIN marker  +  verbatim lines  +
 *   END marker      +  exports  (+ sibling .d.ts)
 *
 * The lines between the BEGIN/END markers are byte-identical to the source
 * HTML. Nothing inside a frozen block is ever rewritten; scoping is provided
 * purely by the import/export shell, mirroring the top-level lexical scope
 * the blocks share in the original page. Deliberate scope facts preserved:
 *   - MASTER is private to the PBData IIFE in the original, so the simulator
 *     module does NOT import it ("typeof MASTER" stays 'undefined').
 *   - engine IS top-level in the original, so master-data imports it.
 *
 * Usage:
 *   node scripts/extract-frozen-promotions.mjs           # (re)generate
 *   node scripts/extract-frozen-promotions.mjs --check   # verify byte parity
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'roshen_settlement_platform.html');
const OUT_DIR = join(ROOT, 'src', 'lib', 'promotions', 'frozen');

const BEGIN = '/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */';
const END = '/* ===== END VERBATIM ===== */';

/** Block specs. Line ranges are 1-based and inclusive, into the source HTML. */
const BLOCKS = [
  {
    file: 'calc-engine.js',
    lines: [676, 823],
    imports: {},
    exports: ['Calc', 'Fmt', 'LineKind', 'Promotion', 'PromotionEngine'],
    types: {
      Calc: 'any', Fmt: 'any', LineKind: 'any',
      Promotion: 'any', PromotionEngine: 'any',
    },
  },
  {
    file: 'platform-data.js',
    lines: [826, 826],
    imports: {},
    exports: ['PLATFORM_DATA'],
  },
  {
    file: 'engine-bootstrap.js',
    lines: [829, 835],
    imports: { './calc-engine.js': ['PromotionEngine'], './platform-data.js': ['PLATFORM_DATA'] },
    exports: ['engine'],
  },
  {
    file: 'filter-engine.js',
    lines: [977, 1087],
    imports: { './calc-engine.js': ['Calc'] },
    exports: ['FilterEngine'],
  },
  {
    file: 'alert-engine.js',
    lines: [1090, 1217],
    imports: { './calc-engine.js': ['Calc', 'Fmt'] },
    exports: ['AlertEngine', 'DrillDown'],
  },
  {
    file: 'raw-parser.js',
    lines: [1220, 1373],
    imports: { './calc-engine.js': ['Calc'], './filter-engine.js': ['FilterEngine'] },
    exports: ['RawParser'],
  },
  {
    file: 'master-data.js',
    lines: [1376, 1413],
    imports: { './engine-bootstrap.js': ['engine'] },
    exports: ['PBData'],
  },
  {
    file: 'pb-model.js',
    lines: [1416, 1498],
    imports: {},
    exports: ['PBModel'],
  },
  {
    file: 'compliance-effectiveness.js',
    lines: [1501, 1636],
    imports: { './calc-engine.js': ['Calc'], './filter-engine.js': ['FilterEngine'] },
    exports: ['ComplianceEngine', 'EffectivenessEngine'],
  },
  {
    file: 'portfolio.js',
    lines: [1639, 1680],
    imports: {
      './calc-engine.js': ['Calc', 'Fmt'],
      './compliance-effectiveness.js': ['ComplianceEngine'],
      './alert-engine.js': ['AlertEngine'],
      './engine-bootstrap.js': ['engine'],
    },
    exports: ['PortfolioDash'],
  },
  {
    file: 'store.js',
    lines: [2296, 2302],
    imports: {},
    exports: ['Store'],
  },
  {
    file: 'data-pool.js',
    lines: [2726, 2849],
    imports: { './engine-bootstrap.js': ['engine'], './store.js': ['Store'] },
    exports: ['AUDITED_SOURCES', 'DataStore', 'invoicesFromParsed'],
  },
  {
    file: 'promo-simulator.js',
    lines: [2852, 3141],
    imports: {
      './calc-engine.js': ['Calc', 'Fmt'],
      './engine-bootstrap.js': ['engine'],
      './data-pool.js': ['DataStore', 'AUDITED_SOURCES'],
      './filter-engine.js': ['FilterEngine'],
      '../ui-bridge.js': ['Util', 'Modal'],
    },
    exports: ['PromoSimulator', 'simStrip', 'simHint', 'openSimModal'],
  },
  {
    file: 'promo-publisher.js',
    lines: [3144, 3272],
    imports: {
      './calc-engine.js': ['Calc'],
      './engine-bootstrap.js': ['engine'],
      './raw-parser.js': ['RawParser'],
      './pb-model.js': ['PBModel'],
      './filter-engine.js': ['FilterEngine'],
      './promo-simulator.js': ['PromoSimulator'],
      '../ui-bridge.js': ['Toast'],
    },
    exports: ['PromoPublisher'],
  },
  {
    file: 'seeds.js',
    lines: [3315, 3437],
    imports: { './pb-model.js': ['PBModel'], './store.js': ['Store'] },
    exports: ['SEED_PROMOS', 'Seeds'],
  },
];

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sliceLines(sourceLines, [start, end]) {
  return sourceLines.slice(start - 1, end).join('\n');
}

function renderModule(block, verbatim) {
  const importLines = Object.entries(block.imports)
    .map(([from, names]) => `import { ${names.join(', ')} } from '${from}';`)
    .join('\n');
  const header = [
    '/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.',
    ` * Source: roshen_settlement_platform.html lines ${block.lines[0]}–${block.lines[1]}`,
    ` * Block sha256: ${sha256(verbatim)}`,
    ' * Regenerate: node scripts/extract-frozen-promotions.mjs',
    ' * Verify:     node scripts/extract-frozen-promotions.mjs --check',
    ' */',
    '/* eslint-disable */',
    '// @ts-nocheck',
  ].join('\n');
  return [
    header,
    importLines,
    BEGIN,
    verbatim,
    END,
    `export { ${block.exports.join(', ')} };`,
    '',
  ].filter((s) => s !== '').join('\n');
}

function renderDts(block) {
  const decls = block.exports
    .map((name) => `export declare const ${name}: ${(block.types && block.types[name]) || 'any'};`)
    .join('\n');
  return [
    '/* AUTO-GENERATED loose declarations for the verbatim frozen module. DO NOT EDIT. */',
    '/* eslint-disable */',
    decls,
    '',
  ].join('\n');
}

function extractVerbatimSegment(fileText, file) {
  const b = fileText.indexOf(BEGIN);
  const e = fileText.indexOf(END);
  if (b === -1 || e === -1 || e <= b) {
    throw new Error(`${file}: BEGIN/END verbatim markers missing or malformed`);
  }
  return fileText.slice(b + BEGIN.length + 1, e - 1); // +1/-1 for the joining newlines
}

const check = process.argv.includes('--check');
const sourceLines = readFileSync(SOURCE, 'utf8').split('\n');
let failures = 0;

if (!check) mkdirSync(OUT_DIR, { recursive: true });

for (const block of BLOCKS) {
  const verbatim = sliceLines(sourceLines, block.lines);
  const outPath = join(OUT_DIR, block.file);
  if (check) {
    if (!existsSync(outPath)) {
      console.error(`FAIL ${block.file}: missing generated file`);
      failures++;
      continue;
    }
    const current = extractVerbatimSegment(readFileSync(outPath, 'utf8'), block.file);
    if (current === verbatim) {
      console.log(`OK   ${block.file} (${block.lines[0]}–${block.lines[1]}, sha256 ${sha256(verbatim).slice(0, 12)}…)`);
    } else {
      console.error(`FAIL ${block.file}: extracted segment differs from the reference HTML`);
      failures++;
    }
  } else {
    writeFileSync(outPath, renderModule(block, verbatim));
    writeFileSync(outPath.replace(/\.js$/, '.d.ts'), renderDts(block));
    console.log(`wrote ${block.file} (lines ${block.lines[0]}–${block.lines[1]})`);
  }
}

if (check) {
  if (failures) {
    console.error(`\n${failures} frozen module(s) out of sync with the reference implementation.`);
    process.exit(1);
  }
  console.log('\nAll frozen modules are byte-identical to the reference implementation.');
}
