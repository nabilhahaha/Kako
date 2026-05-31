/** ── Export Engine: serialization (no external deps) ───────────────────────
 *  Turns a generic { headers, rows } table into CSV, JSON, or a real Excel
 *  (.xlsx) workbook. The .xlsx writer builds a valid OOXML package as a
 *  store-only ZIP in pure Node (Buffers) — no `xlsx`/`exceljs` dependency, so
 *  it works in the locked-down build environment. The serializer is generic: it
 *  has no knowledge of any entity. Run server-side (Node runtime). */

export type Cell = string | number | boolean | null | undefined;
export type ExportRow = Record<string, Cell>;

/** RFC-4180 CSV (caller prepends a BOM for Excel UTF-8 detection). */
export function toCsv(headers: string[], rows: ExportRow[]): string {
  const esc = (v: Cell) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return lines.join('\r\n');
}

/** Pretty JSON array of objects, restricted to the given columns. */
export function toJson(headers: string[], rows: ExportRow[]): string {
  const projected = rows.map((r) => {
    const o: Record<string, Cell> = {};
    for (const h of headers) o[h] = r[h] ?? null;
    return o;
  });
  return JSON.stringify(projected, null, 2);
}

// ── Minimal .xlsx (OOXML) writer ────────────────────────────────────────────

// XML 1.0 forbids most control chars; keep \t \n \r. Build the class without
// literal control chars in source.
const CONTROL_RE = new RegExp('[' +
  '\u0000-\u0008\u000B\u000C\u000E-\u001F' + ']', 'g');
const xmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(CONTROL_RE, '');

/** 0-based column index → spreadsheet column letters (0→A, 26→AA). */
function colLetter(n: number): string {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(headers: string[], rows: ExportRow[]): string {
  const cell = (ref: string, v: Cell): string => {
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
    const s = v == null ? '' : String(v);
    if (s === '') return `<c r="${ref}"/>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(s)}</t></is></c>`;
  };
  const out: string[] = [];
  out.push(`<row r="1">${headers.map((h, c) => cell(`${colLetter(c)}1`, h)).join('')}</row>`);
  rows.forEach((r, i) => {
    const rn = i + 2;
    out.push(`<row r="${rn}">${headers.map((h, c) => cell(`${colLetter(c)}${rn}`, r[h])).join('')}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${out.join('')}</sheetData></worksheet>`;
}

function sanitizeSheetName(name: string): string {
  // Excel: ≤31 chars, none of : \ / ? * [ ]
  const clean = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return clean || 'Sheet1';
}

/** Build a valid .xlsx workbook (single sheet) as a Buffer. */
export function toXlsx(sheetName: string, headers: string[], rows: ExportRow[]): Buffer {
  const name = sanitizeSheetName(sheetName);
  const files: Array<{ path: string; data: Buffer }> = [
    {
      path: '[Content_Types].xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
      ),
    },
    {
      path: '_rels/.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
      ),
    },
    {
      path: 'xl/workbook.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${xmlEsc(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
      ),
    },
    { path: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml(headers, rows)) },
  ];
  return zipStore(files);
}

// ── store-only ZIP (method 0, no compression) ───────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ path: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.path, 'utf8');
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header sig
    local.writeUInt16LE(20, 4);         // version needed
    local.writeUInt16LE(0, 6);          // flags
    local.writeUInt16LE(0, 8);          // method 0 = store
    local.writeUInt16LE(0, 10);         // mod time
    local.writeUInt16LE(0x21, 12);      // mod date (1980-01-01-ish)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);      // compressed size
    local.writeUInt32LE(size, 22);      // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);         // extra len
    locals.push(local, nameBuf, f.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central dir sig
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0, 8);          // flags
    central.writeUInt16LE(0, 10);         // method
    central.writeUInt16LE(0, 12);         // mod time
    central.writeUInt16LE(0x21, 14);      // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);         // extra len
    central.writeUInt16LE(0, 32);         // comment len
    central.writeUInt16LE(0, 34);         // disk number
    central.writeUInt16LE(0, 36);         // internal attrs
    central.writeUInt32LE(0, 38);         // external attrs
    central.writeUInt32LE(offset, 42);    // local header offset
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + f.data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const localBuf = Buffer.concat(locals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);          // end of central dir sig
  end.writeUInt16LE(0, 4);                   // disk number
  end.writeUInt16LE(0, 6);                   // central dir start disk
  end.writeUInt16LE(files.length, 8);        // entries on this disk
  end.writeUInt16LE(files.length, 10);       // total entries
  end.writeUInt32LE(centralBuf.length, 12);  // central dir size
  end.writeUInt32LE(localBuf.length, 16);    // central dir offset
  end.writeUInt16LE(0, 20);                  // comment len

  return Buffer.concat([localBuf, centralBuf, end]);
}
