/** ── Import Engine: real .xlsx reader (no external deps) ───────────────────
 *  Parses a genuine Excel .xlsx workbook into { headers, rows } — the same
 *  shape the CSV/JSON parser produces — so the Import Engine treats every source
 *  identically. An .xlsx is an OOXML package (a ZIP of XML parts); this reads
 *  the ZIP (stored + deflate entries, via Node's zlib), resolves the first
 *  worksheet through the workbook relationships, and decodes shared strings,
 *  inline strings, numbers and booleans. Runs on the Node runtime (server). */

import { inflateRawSync } from 'zlib';

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

// ── ZIP reader (central-directory based; methods 0 store / 8 deflate) ────────

function findEocd(buf: Buffer): number {
  // End Of Central Directory signature 0x06054b50, scanning from the end.
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('Not a valid .xlsx (no ZIP end record).');
}

function readZip(buf: Buffer): Map<string, Buffer> {
  const eocd = findEocd(buf);
  const entryCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset
  const out = new Map<string, Buffer>();

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break; // central dir header sig
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // Jump to the local header to find the actual data offset.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ── XML helpers ──────────────────────────────────────────────────────────────

function xmlDecode(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // last, so we don't double-decode
}

/** Concatenate the text of every <t>…</t> inside a fragment (handles rich runs). */
function joinText(fragment: string): string {
  let out = '';
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out += xmlDecode(m[1]);
  return out;
}

/** xl/sharedStrings.xml → ordered array of strings. */
function parseSharedStrings(xml?: Buffer): string[] {
  if (!xml) return [];
  const text = xml.toString('utf8');
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(joinText(m[1]));
  return out;
}

/** Resolve the first worksheet's part path via workbook + rels (fallback sheet1). */
function firstSheetPath(zip: Map<string, Buffer>): string {
  const wb = zip.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels = zip.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const sheet = /<sheet\b[^>]*\/?>/.exec(wb)?.[0] ?? '';
  const rid = /r:id="([^"]+)"/.exec(sheet)?.[1];
  if (rid) {
    const relRe = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`);
    const rel = relRe.exec(rels)?.[0] ?? '';
    let target = /Target="([^"]+)"/.exec(rel)?.[1];
    if (target) {
      target = target.replace(/^\//, '').replace(/^xl\//, '');
      const path = `xl/${target}`;
      if (zip.has(path)) return path;
    }
  }
  // Fallbacks.
  for (const k of zip.keys()) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) return k;
  return 'xl/worksheets/sheet1.xml';
}

/** 'B3' → 1 (0-based column index). */
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Parse the first worksheet of an .xlsx buffer into { headers, rows }. The
 *  first non-empty row is the header; subsequent rows are keyed by header. */
export function parseXlsxBuffer(buf: Buffer): ParsedSheet {
  const zip = readZip(buf);
  const shared = parseSharedStrings(zip.get('xl/sharedStrings.xml'));
  const sheetXml = zip.get(firstSheetPath(zip))?.toString('utf8');
  if (!sheetXml) return { headers: [], rows: [] };

  const matrix: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowM: RegExpExecArray | null;
  while ((rowM = rowRe.exec(sheetXml))) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cM: RegExpExecArray | null;
    while ((cM = cellRe.exec(rowM[1]))) {
      const attrs = cM[1];
      const inner = cM[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      const idx = ref ? colIndex(ref) : cells.length;

      let value = '';
      if (t === 's') {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        value = v != null ? (shared[Number(v)] ?? '') : '';
      } else if (t === 'inlineStr') {
        value = joinText(inner);
      } else if (t === 'str') {
        value = xmlDecode(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      } else if (t === 'b') {
        value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] === '1' ? 'TRUE' : 'FALSE';
      } else {
        value = xmlDecode(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      }
      cells[idx] = value;
    }
    matrix.push(cells);
  }

  // First non-empty row = headers.
  const headerRowIdx = matrix.findIndex((r) => r.some((c) => (c ?? '').trim() !== ''));
  if (headerRowIdx === -1) return { headers: [], rows: [] };
  const headers = matrix[headerRowIdx].map((h) => (h ?? '').trim());

  const rows: Record<string, string>[] = [];
  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || !r.some((c) => (c ?? '').trim() !== '')) continue; // skip blank rows
    const rec: Record<string, string> = {};
    headers.forEach((h, c) => { if (h) rec[h] = (r[c] ?? '').trim(); });
    rows.push(rec);
  }
  return { headers, rows };
}
