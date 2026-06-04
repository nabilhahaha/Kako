'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Search, Check, ChevronDown, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { searchProducts, searchCustomers } from '@/app/(app)/fmcg/actions';
import {
  comboReducer,
  initialComboState,
  type ComboItem,
} from './combobox-reducer';

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 250;

/** A row the combobox can render: needs an id and a bilingual-ish label pair. */
export interface ComboRow extends ComboItem {
  primary: string;
  secondary?: string | null;
}

/** Generic searchable, debounced, paginated combobox. The `search` prop returns
 *  a page of rows for (query, limit, offset); the combobox never loads the full
 *  catalog — it fetches a page at a time and supports "load more". Mobile-first
 *  (full-width control, large touch targets), keyboard + RTL aware. */
export function SearchCombobox({
  value,
  onSelect,
  search,
  placeholder,
  selectedLabel,
  disabled,
  className,
}: {
  value: string | null;
  onSelect: (id: string | null, row: ComboRow | null) => void;
  search: (q: string, limit: number, offset: number) => Promise<ComboRow[]>;
  placeholder?: string;
  /** Label to show in the closed control for the current value. */
  selectedLabel?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(comboReducer<ComboRow>, initialComboState<ComboRow>(value));
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A per-request token so a slow earlier response can't overwrite a newer one.
  const reqIdRef = useRef(0);

  const runSearch = useCallback(
    async (q: string, offset: number, append: boolean) => {
      const reqId = ++reqIdRef.current;
      dispatch(append ? { type: 'loadMore' } : { type: 'searchStart' });
      try {
        const rows = await search(q, PAGE_SIZE, offset);
        if (reqId !== reqIdRef.current) return; // a newer request superseded this
        dispatch({ type: 'searchSuccess', rows, pageSize: PAGE_SIZE, append });
      } catch {
        if (reqId !== reqIdRef.current) return;
        dispatch({ type: 'searchError' });
      }
    },
    [search],
  );

  // Debounced query → search. Resets pagination on every keystroke.
  function onQueryChange(q: string) {
    dispatch({ type: 'setQuery', query: q });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q, 0, false), DEBOUNCE_MS);
  }

  // Initial page when the dropdown first opens with no query.
  function openDropdown() {
    dispatch({ type: 'open', open: true });
    if (state.items.length === 0) runSearch(state.query, 0, false);
  }

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        dispatch({ type: 'open', open: false });
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const shownLabel = selectedLabel && value ? selectedLabel : '';

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {/* Closed control: shows the selected label (or placeholder) + a clear button. */}
      <button
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-start text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn('truncate', !shownLabel && 'text-muted-foreground')}>
          {shownLabel || placeholder || t('fmcgw1.searchPlaceholder')}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {value && (
            <X
              className="h-4 w-4 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null, null);
                dispatch({ type: 'select', id: null });
              }}
              aria-label={t('fmcgw1.clear')}
            />
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
      </button>

      {state.open && (
        <div className="absolute z-50 mt-1 max-h-80 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          <div className="relative border-b p-2">
            <Search
              className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              type="search"
              value={state.query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder ?? t('fmcgw1.searchPlaceholder')}
              className="ps-9"
            />
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {state.loading && state.items.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('fmcgw1.searching')}
              </div>
            )}

            {!state.loading && state.items.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {t('fmcgw1.noResults')}
              </p>
            )}

            {state.items.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  dispatch({ type: 'select', id: row.id });
                  onSelect(row.id, row);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm hover:bg-secondary"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{row.primary}</span>
                  {row.secondary && (
                    <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                      {row.secondary}
                    </span>
                  )}
                </span>
                {value === row.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}

            {state.hasMore && (
              <div className="p-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={state.loading}
                  onClick={() => runSearch(state.query, state.offset, true)}
                >
                  {state.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('fmcgw1.loadMore')
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Product combobox — wraps the server `searchProducts` action; localizes the
 *  display name (Arabic name preferred under the ar locale). Never loads the
 *  full catalog: each page is a server round-trip. */
export function ProductCombobox(props: {
  value: string | null;
  onSelect: (id: string | null, row: ComboRow | null) => void;
  selectedLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const search = useCallback(
    async (q: string, limit: number, offset: number): Promise<ComboRow[]> => {
      const res = await searchProducts(q, limit, offset);
      if (!res.ok || !res.data) return [];
      return res.data.map((p) => ({
        id: p.id,
        primary: (locale === 'ar' ? p.name_ar || p.name : p.name) || p.code,
        secondary: [p.code, p.barcode].filter(Boolean).join(' · ') || null,
      }));
    },
    [locale],
  );
  return <SearchCombobox {...props} search={search} />;
}

/** Customer combobox — wraps the server `searchCustomers` action (ILIKE over
 *  erp_customers, RLS-scoped). Same pattern as the product combobox. */
export function CustomerCombobox(props: {
  value: string | null;
  onSelect: (id: string | null, row: ComboRow | null) => void;
  selectedLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const search = useCallback(
    async (q: string, limit: number, offset: number): Promise<ComboRow[]> => {
      const res = await searchCustomers(q, limit, offset);
      if (!res.ok || !res.data) return [];
      return res.data.map((c) => ({
        id: c.id,
        primary: (locale === 'ar' ? c.name_ar || c.name : c.name) || c.code,
        secondary: [c.code, c.phone].filter(Boolean).join(' · ') || null,
      }));
    },
    [locale],
  );
  return <SearchCombobox {...props} search={search} />;
}
