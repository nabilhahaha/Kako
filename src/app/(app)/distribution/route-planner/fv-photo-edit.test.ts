import { describe, it, expect } from 'vitest';
import { removeFileAt, mergeFiles } from './fv-photo-edit';

// Lightweight File stand-ins (node test env has no real File); only identity matters.
const f = (name: string) => ({ name }) as unknown as File;

describe('FV photo edit — remove before submit', () => {
  it('removes one inside photo without touching the others (order preserved)', () => {
    const list = [f('a'), f('b'), f('c')];
    expect(removeFileAt(list, 1).map((x) => x.name)).toEqual(['a', 'c']);
  });
  it('removing the only (outside) photo empties the list → Submit re-blocks', () => {
    expect(removeFileAt([f('only')], 0)).toEqual([]);
  });
  it('out-of-range index leaves the list unchanged (and returns a copy)', () => {
    const list = [f('a')];
    const out = removeFileAt(list, 5);
    expect(out.map((x) => x.name)).toEqual(['a']);
    expect(out).not.toBe(list);
  });
});

describe('FV photo edit — add / replace before submit', () => {
  it('single (outside): a new pick REPLACES the previous photo', () => {
    expect(mergeFiles([f('old')], [f('new')], false).map((x) => x.name)).toEqual(['new']);
  });
  it('single: only the first picked file is kept', () => {
    expect(mergeFiles([], [f('x'), f('y')], false).map((x) => x.name)).toEqual(['x']);
  });
  it('multiple (inside): new picks are APPENDED to the existing photos', () => {
    expect(mergeFiles([f('a')], [f('b'), f('c')], true).map((x) => x.name)).toEqual(['a', 'b', 'c']);
  });
  it('empty pick leaves the list unchanged', () => {
    expect(mergeFiles([f('a')], [], true).map((x) => x.name)).toEqual(['a']);
  });
  it('remove then re-add works (replace an inside photo): remove index 0, append a new one', () => {
    let list = [f('wrong'), f('keep')];
    list = removeFileAt(list, 0);          // remove the wrong one
    list = mergeFiles(list, [f('right')], true);
    expect(list.map((x) => x.name)).toEqual(['keep', 'right']);
  });
});
