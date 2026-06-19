/** ── Export Engine: minimal .xlsx writer (no external deps, browser-safe) ──────
 *  Serializes a simple sheet (header row + data rows) into a genuine Excel .xlsx
 *  workbook — the mirror of `xlsx-read.ts`. An .xlsx is an OOXML package (a ZIP of
 *  XML parts); this builds the parts and packs them into a STORED (uncompressed)
 *  ZIP with CRC-32, which Excel / Google Sheets open natively. Uses only
 *  Uint8Array + TextEncoder, so it runs in the browser (client-side download) as
 *  well as on Node. Strings are emitted as inline strings; numbers as numeric
 *  cells — the exact shapes `parseXlsxBuffer` reads back. */

export type XlsxCell = string | number | null | undefined;

// ── CRC-32 (for ZIP entries) ──────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── little-endian helpers ──────────────────────────────────────────────────────
const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

const xmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 0-based column index → spreadsheet column letters (0→A, 26→AA). */
function colLetter(n: number): string {
  let s = '';
  let x = n + 1;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function cellXml(ref: string, v: XlsxCell): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
}

function sheetXml(rows: readonly XlsxCell[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row.map((v, c) => cellXml(`${colLetter(c)}${r + 1}`, v)).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** A worksheet name Excel accepts: ≤31 chars, no \ / ? * [ ] : characters. */
function safeSheetName(name: string): string {
  return (name || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1';
}

function parts(rows: readonly XlsxCell[][], sheetName: string): { name: string; xml: string }[] {
  const sn = xmlEsc(safeSheetName(sheetName));
  return [
    {
      name: '[Content_Types].xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sn}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    { name: 'xl/worksheets/sheet1.xml', xml: sheetXml(rows) },
  ];
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/**
 * Build an .xlsx workbook (single sheet) from a row matrix. `rows[0]` is the
 * header row; subsequent rows are data. Returns the raw bytes (Uint8Array) —
 * wrap in a Blob to download in the browser, or Buffer.from(...) on Node. Pure.
 */
export function buildXlsx(rows: readonly XlsxCell[][], sheetName = 'Sheet1'): Uint8Array {
  const enc = new TextEncoder();
  const files = parts(rows, sheetName).map((p) => ({ nameBytes: enc.encode(p.name), data: enc.encode(p.xml) }));

  const chunks: Uint8Array[] = [];
  const central: { crc: number; size: number; nameBytes: Uint8Array; offset: number }[] = [];
  let offset = 0;
  for (const f of files) {
    const crc = crc32(f.data);
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length),
      ...u16(f.nameBytes.length), ...u16(0),
    ];
    chunks.push(Uint8Array.from(local), f.nameBytes, f.data);
    central.push({ crc, size: f.data.length, nameBytes: f.nameBytes, offset });
    offset += local.length + f.nameBytes.length + f.data.length;
  }

  const cdStart = offset;
  for (const c of central) {
    const cd = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(c.crc), ...u32(c.size), ...u32(c.size),
      ...u16(c.nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(c.offset),
    ];
    chunks.push(Uint8Array.from(cd), c.nameBytes);
    offset += cd.length + c.nameBytes.length;
  }

  const cdSize = offset - cdStart;
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(cdStart), ...u16(0),
  ];
  chunks.push(Uint8Array.from(eocd));
  return concat(chunks);
}
