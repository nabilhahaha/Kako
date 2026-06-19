import { describe, it, expect } from 'vitest';
import { buildXlsx, buildXlsxWorkbook } from './xlsx-write';
import { parseXlsxBuffer } from './xlsx-read';

describe('buildXlsx', () => {
  it('writes an .xlsx that the reader parses back (roundtrip)', () => {
    const rows = [
      ['Route', 'Customer Code', 'Name', 'Latitude', 'Longitude'],
      ['Route 1', 'C001', 'Sample Market', 21.581, 39.165],
      ['Route 2', 'C002', 'Corner Grocery, Ltd', 24.71, 46.67],
    ];
    const bytes = buildXlsx(rows, 'Routes');
    const parsed = parseXlsxBuffer(Buffer.from(bytes));
    expect(parsed.headers).toEqual(['Route', 'Customer Code', 'Name', 'Latitude', 'Longitude']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]['Customer Code']).toBe('C001');
    expect(parsed.rows[0]['Name']).toBe('Sample Market');
    expect(parsed.rows[0]['Latitude']).toBe('21.581');
    // Commas/quotes survive (inline strings, not CSV).
    expect(parsed.rows[1]['Name']).toBe('Corner Grocery, Ltd');
    expect(parsed.rows[1]['Longitude']).toBe('46.67');
  });

  it('escapes XML-special characters in strings', () => {
    const bytes = buildXlsx([['H'], ['a < b & "c"']], 'S');
    const parsed = parseXlsxBuffer(Buffer.from(bytes));
    expect(parsed.rows[0]['H']).toBe('a < b & "c"');
  });

  it('produces a valid ZIP container (PK signature)', () => {
    const bytes = buildXlsx([['x'], ['y']]);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
  });

  it('writes a multi-sheet workbook (first sheet parses; both sheet names present)', () => {
    const bytes = buildXlsxWorkbook([
      { name: 'Route Allocation', rows: [['Route', 'Code'], ['Route 1', 'C001']] },
      { name: 'Needs Review', rows: [['Route', 'Code'], ['Needs Review', 'HW1']] },
    ]);
    const parsed = parseXlsxBuffer(Buffer.from(bytes));
    expect(parsed.rows[0]['Code']).toBe('C001'); // reader returns the first sheet
    // Both worksheet parts + names exist in the package.
    const xml = Buffer.from(bytes).toString('latin1');
    expect(xml).toContain('worksheets/sheet2.xml');
    expect(xml).toContain('Needs Review');
  });
});
