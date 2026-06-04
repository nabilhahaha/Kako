import { describe, it, expect } from 'vitest';
import {
  comboReducer,
  initialComboState,
  type ComboState,
} from './combobox-reducer';

interface Row {
  id: string;
  primary: string;
}

const s0 = () => initialComboState<Row>();

describe('comboReducer · query + pagination', () => {
  it('setQuery resets pagination and opens the dropdown', () => {
    const s = comboReducer({ ...s0(), offset: 40, open: false }, { type: 'setQuery', query: 'milk' });
    expect(s.query).toBe('milk');
    expect(s.offset).toBe(0);
    expect(s.open).toBe(true);
  });

  it('searchSuccess (replace) stores rows, sets offset to count, flags hasMore on a full batch', () => {
    const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, primary: `P${i}` }));
    const s = comboReducer(s0(), { type: 'searchSuccess', rows, pageSize: 20, append: false });
    expect(s.items).toHaveLength(20);
    expect(s.offset).toBe(20);
    expect(s.hasMore).toBe(true);
    expect(s.loading).toBe(false);
  });

  it('searchSuccess with a partial batch clears hasMore', () => {
    const rows: Row[] = [{ id: 'a', primary: 'A' }, { id: 'b', primary: 'B' }];
    const s = comboReducer(s0(), { type: 'searchSuccess', rows, pageSize: 20, append: false });
    expect(s.hasMore).toBe(false);
    expect(s.offset).toBe(2);
  });

  it('append merges pages and de-duplicates by id', () => {
    let s: ComboState<Row> = comboReducer(s0(), {
      type: 'searchSuccess',
      rows: [{ id: 'a', primary: 'A' }, { id: 'b', primary: 'B' }],
      pageSize: 2,
      append: false,
    });
    // second page overlaps 'b' and adds 'c' — dedupe keeps one 'b'.
    s = comboReducer(s, {
      type: 'searchSuccess',
      rows: [{ id: 'b', primary: 'B' }, { id: 'c', primary: 'C' }],
      pageSize: 2,
      append: true,
    });
    expect(s.items.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(s.offset).toBe(3);
  });

  it('loadMore / searchStart toggle loading; searchError clears it', () => {
    expect(comboReducer(s0(), { type: 'loadMore' }).loading).toBe(true);
    expect(comboReducer(s0(), { type: 'searchStart' }).loading).toBe(true);
    expect(comboReducer({ ...s0(), loading: true }, { type: 'searchError' }).loading).toBe(false);
  });
});

describe('comboReducer · selection', () => {
  it('select stores the id and closes the dropdown', () => {
    const s = comboReducer({ ...s0(), open: true }, { type: 'select', id: 'p1' });
    expect(s.selectedId).toBe('p1');
    expect(s.open).toBe(false);
  });

  it('select(null) clears the selection', () => {
    const s = comboReducer({ ...s0(), selectedId: 'p1', open: true }, { type: 'select', id: null });
    expect(s.selectedId).toBeNull();
  });

  it('open toggles visibility without touching items', () => {
    const withItems = comboReducer(s0(), {
      type: 'searchSuccess',
      rows: [{ id: 'a', primary: 'A' }],
      pageSize: 20,
      append: false,
    });
    const closed = comboReducer(withItems, { type: 'open', open: false });
    expect(closed.open).toBe(false);
    expect(closed.items).toHaveLength(1);
  });
});
