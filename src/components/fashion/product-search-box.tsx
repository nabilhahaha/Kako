'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { HighlightedText } from '@/components/shared/highlighted-text';
import { searchProducts, exactScanMatch, type SearchableProduct } from '@/lib/fashion/search';

/** Cashier product search — an always-visible inline field that searches the
 *  already-loaded catalog (no server round-trip) by barcode, code (SKU) or name
 *  and shows a ranked, keyboard-navigable suggestion list. Built for a fast,
 *  keyboard-first POS: a hardware scanner types a barcode then sends Enter, which
 *  adds the exact match instantly; a human types a name and picks with ↑/↓/Enter.
 *  Mobile-first (large targets), RTL-aware, dependency-free. Generic over any row
 *  that satisfies {@link SearchableProduct} so it can be reused beyond the POS. */
export function ProductSearchBox<T extends SearchableProduct>({
  items,
  onSelect,
  renderMeta,
  placeholder,
  autoFocus = false,
  limit = 8,
  onNoMatch,
  className,
}: {
  items: readonly T[];
  /** Called when the cashier picks (or scans) a product. */
  onSelect: (item: T) => void;
  /** Optional trailing content per row (e.g. price). */
  renderMeta?: (item: T) => ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
  limit?: number;
  /** Called when Enter is pressed but nothing matched (e.g. unknown barcode). */
  onNoMatch?: (query: string) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = searchProducts(items, query, limit);
  const open = focused && query.trim().length > 0;
  const activeIndex = results.length > 0 ? Math.min(highlight, results.length - 1) : 0;

  function commit(item: T) {
    onSelect(item);
    setQuery('');
    setHighlight(0);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!query.trim()) return;
      // A scanner's exact barcode/code hit wins over the highlighted suggestion,
      // so a scan-then-Enter always adds the scanned item even mid-navigation.
      const chosen = exactScanMatch(items, query) ?? results[activeIndex] ?? null;
      if (chosen) commit(chosen);
      else onNoMatch?.(query.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      setHighlight(0);
    }
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- POS: the cashier's cursor must land here for scanning.
          autoFocus={autoFocus}
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="enter"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results.length > 0 ? `${listId}-opt-${activeIndex}` : undefined}
          value={query}
          placeholder={placeholder ?? t('fashion.sell.searchPlaceholder')}
          className="h-12 ps-10 text-base"
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          // Delay so a click on a suggestion lands before the list unmounts.
          onBlur={() => setTimeout(() => setFocused(false), 120)}
        />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('fashion.sell.noResults')}
            </li>
          ) : (
            results.map((item, i) => (
              <li key={item.product_id} role="option" id={`${listId}-opt-${i}`} aria-selected={i === activeIndex}>
                <button
                  type="button"
                  tabIndex={-1}
                  // onMouseDown (not onClick) so it fires before the input's blur.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(item);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-start text-sm',
                    i === activeIndex ? 'bg-secondary' : 'hover:bg-secondary/60',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      <HighlightedText text={item.name} query={query} />
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground" dir="ltr">
                      <HighlightedText text={item.code} query={query} />
                      {item.barcode ? <> · <HighlightedText text={item.barcode} query={query} /></> : null}
                    </span>
                  </span>
                  {renderMeta && <span className="shrink-0 text-end">{renderMeta(item)}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
