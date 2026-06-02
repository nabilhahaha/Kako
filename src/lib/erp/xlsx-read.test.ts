import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'zlib';
import { parseXlsxBuffer } from './xlsx-read';
import { toXlsx } from './export-serialize';

/** Minimal ZIP builder for tests — supports deflate (method 8) so we can
 *  exercise the real-Excel code path (compressed parts + sharedStrings). */
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function buildZip(files: Array<{ path: string; xml: string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.path, 'utf8');
    const data = Buffer.from(f.xml, 'utf8');
    const comp = deflateRawSync(data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const ld = Buffer.concat(locals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(ld.length, 16);
  return Buffer.concat([ld, cd, end]);
}

describe('xlsx-read: round-trips the export writer (store + inlineStr)', () => {
  it('reads back headers, rows, numbers and Arabic strings', () => {
    const headers = ['code', 'name', 'credit_limit'];
    const rows = [
      { code: 'C1', name: 'Acme, Inc', credit_limit: 5000 },
      { code: 'C2', name: 'مكتبة "النور"', credit_limit: 0 },
    ];
    const buf = toXlsx('Customers', headers, rows);
    const parsed = parseXlsxBuffer(buf);
    expect(parsed.headers).toEqual(headers);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ code: 'C1', name: 'Acme, Inc', credit_limit: '5000' });
    expect(parsed.rows[1].name).toBe('مكتبة "النور"');
    expect(parsed.rows[1].credit_limit).toBe('0');
  });
});

describe('xlsx-read: real-Excel path (deflate + sharedStrings + t="s")', () => {
  const sharedStrings =
    `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="5" uniqueCount="5">` +
    `<si><t>code</t></si><si><t>name</t></si><si><t>phone</t></si>` +
    `<si><t>Ahmed &amp; Sons</t></si><si><t>عميل</t></si></sst>`;
  const sheet =
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
    `<row r="2"><c r="A2"><v>1001</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="str"><v>0100</v></c></row>` +
    `<row r="3"><c r="A3"><v>1002</v></c><c r="B3" t="s"><v>4</v></c></row>` +
    `</sheetData></worksheet>`;
  const workbook =
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels =
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const buf = buildZip([
    { path: 'xl/workbook.xml', xml: workbook },
    { path: 'xl/_rels/workbook.xml.rels', xml: rels },
    { path: 'xl/sharedStrings.xml', xml: sharedStrings },
    { path: 'xl/worksheets/sheet1.xml', xml: sheet },
  ]);

  it('resolves shared strings, gaps, numbers and entity decoding', () => {
    const parsed = parseXlsxBuffer(buf);
    expect(parsed.headers).toEqual(['code', 'name', 'phone']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ code: '1001', name: 'Ahmed & Sons', phone: '0100' });
    // row 3 omits column C entirely → phone is blank, Arabic shared string resolves
    expect(parsed.rows[1]).toEqual({ code: '1002', name: 'عميل', phone: '' });
  });
});
