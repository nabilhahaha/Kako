import { describe, it, expect } from 'vitest';
import { toCsv, toJson, toXlsx } from './export-serialize';

const headers = ['code', 'name', 'credit_limit'];
const rows = [
  { code: 'C1', name: 'Acme, Inc', credit_limit: 5000 },
  { code: 'C2', name: 'Line\nBreak "Co"', credit_limit: 0 },
  { code: 'C3', name: '', credit_limit: null },
];

describe('export-serialize: CSV', () => {
  it('quotes commas, quotes and newlines; keeps a header row', () => {
    const csv = toCsv(headers, rows);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('code,name,credit_limit');
    expect(lines[1]).toBe('C1,"Acme, Inc",5000');
    // quoted field with embedded newline => the record spans physical lines
    expect(csv).toContain('"Line\nBreak ""Co"""');
    expect(csv).toContain('C3,,'); // null/empty render blank
  });
});

describe('export-serialize: JSON', () => {
  it('projects only the requested columns and nulls blanks', () => {
    const parsed = JSON.parse(toJson(headers, rows));
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ code: 'C1', name: 'Acme, Inc', credit_limit: 5000 });
    expect(parsed[2].credit_limit).toBeNull();
    expect(Object.keys(parsed[0])).toEqual(headers);
  });
});

describe('export-serialize: XLSX', () => {
  const buf = toXlsx('Customers', headers, rows);

  it('produces a ZIP (PK signature) ending with the EOCD record', () => {
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    // End Of Central Directory signature 0x06054b50 appears near the end.
    const eocd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocd).toBeGreaterThan(0);
    // total-entries field (offset +10) = 5 package parts
    expect(buf.readUInt16LE(eocd + 10)).toBe(5);
  });

  it('contains the required OOXML parts and the cell values', () => {
    const s = buf.toString('latin1');
    expect(s).toContain('[Content_Types].xml');
    expect(s).toContain('xl/workbook.xml');
    expect(s).toContain('xl/worksheets/sheet1.xml');
    // sheet XML carries the header + a numeric and an escaped string cell
    expect(s).toContain('<v>5000</v>');
    expect(s).toContain('Acme, Inc');
    expect(s).toContain('&quot;Co&quot;'); // quotes escaped in inlineStr
  });
});
