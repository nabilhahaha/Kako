/** Pure state machine for the searchable combobox (product / customer).
 *  Extracted from the component so its debounce / pagination / selection logic
 *  is unit-testable without React. The component owns the debounce *timer*; this
 *  reducer owns *what to do* with query/result events. Generic over the row type
 *  (rows just need an `id`). */

export interface ComboItem {
  id: string;
}

export interface ComboState<T extends ComboItem> {
  /** Current text in the search box. */
  query: string;
  /** Accumulated, de-duplicated result rows (across "load more" pages). */
  items: T[];
  /** 0-based offset of the NEXT page to fetch. */
  offset: number;
  /** Whether the last page returned a full batch (⇒ there may be more). */
  hasMore: boolean;
  loading: boolean;
  open: boolean;
  /** The currently-selected row id (null = none). */
  selectedId: string | null;
}

export type ComboAction<T extends ComboItem> =
  | { type: 'setQuery'; query: string }
  | { type: 'searchStart' }
  | { type: 'searchSuccess'; rows: T[]; pageSize: number; append: boolean }
  | { type: 'searchError' }
  | { type: 'loadMore' }
  | { type: 'select'; id: string | null }
  | { type: 'open'; open: boolean };

export function initialComboState<T extends ComboItem>(selectedId: string | null = null): ComboState<T> {
  return {
    query: '',
    items: [],
    offset: 0,
    hasMore: false,
    loading: false,
    open: false,
    selectedId,
  };
}

/** De-duplicate by id, preserving order (first occurrence wins). */
function dedupe<T extends ComboItem>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

export function comboReducer<T extends ComboItem>(
  state: ComboState<T>,
  action: ComboAction<T>,
): ComboState<T> {
  switch (action.type) {
    case 'setQuery':
      // A new query resets pagination; results arrive via a later searchSuccess.
      return { ...state, query: action.query, offset: 0, open: true };

    case 'searchStart':
      return { ...state, loading: true };

    case 'searchSuccess': {
      const merged = action.append ? dedupe([...state.items, ...action.rows]) : dedupe(action.rows);
      return {
        ...state,
        loading: false,
        items: merged,
        // Next page starts after everything we now hold.
        offset: merged.length,
        // A full batch implies there may be another page.
        hasMore: action.rows.length >= action.pageSize,
      };
    }

    case 'searchError':
      return { ...state, loading: false };

    case 'loadMore':
      return { ...state, loading: true };

    case 'select':
      return { ...state, selectedId: action.id, open: false };

    case 'open':
      return { ...state, open: action.open };

    default:
      return state;
  }
}
