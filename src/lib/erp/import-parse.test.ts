import { describe, it, expect } from 'vitest';
import { parseCsv, parseJson, parseFile } from './import-parse';

describe('import-parse — CSV', () => {
  it('parses headers + rows into string-keyed records', () => {
    const r = parseCsv('name,code\nAcme,C1\nGlobex,C2\n');
    expect(r.headers).toEqual(['name', 'code']);
    expect(r.rows).toEqual([{ name: 'Acme', code: 'C1' }, { name: 'Globex', code: 'C2' }]);
  });
  it('handles quoted fields with commas and embedded newlines', () => {
    const r = parseCsv('name,note\n"Acme, Inc.","line1\nline2"\n');
    expect(r.rows[0].name).toBe('Acme, Inc.');
    expect(r.rows[0].note).toBe('line1\nline2');
  });
  it('handles escaped quotes ("")', () => {
    const r = parseCsv('name\n"He said ""hi"""\n');
    expect(r.rows[0].name).toBe('He said "hi"');
  });
  it('drops trailing empty rows', () => {
    const r = parseCsv('a\n1\n\n');
    expect(r.rows).toEqual([{ a: '1' }]);
  });
});

describe('import-parse — JSON', () => {
  it('parses an array of objects', () => {
    const r = parseJson('[{"name":"X","code":"1"},{"name":"Y"}]');
    expect(r.headers).toEqual(expect.arrayContaining(['name', 'code']));
    expect(r.rows[0]).toEqual({ name: 'X', code: '1' });
    expect(r.rows[1].name).toBe('Y');
  });
  it('accepts { data: [...] }', () => {
    const r = parseJson('{"data":[{"a":"1"}]}');
    expect(r.rows).toEqual([{ a: '1' }]);
  });
  it('throws on non-array JSON', () => {
    expect(() => parseJson('{"foo":1}')).toThrow();
  });
});

describe('import-parse — parseFile dispatch', () => {
  it('routes by extension', () => {
    expect(parseFile('x.csv', 'a\n1').rows).toEqual([{ a: '1' }]);
    expect(parseFile('x.json', '[{"a":"1"}]').rows).toEqual([{ a: '1' }]);
  });
});
