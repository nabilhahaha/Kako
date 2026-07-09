/** Global search box with a live results dropdown. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Package, Receipt, Search, Truck, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSearch } from '../hooks/queries';
import type { SearchHitType } from '../services/searchService';

const ICONS: Record<SearchHitType, typeof Search> = {
  PI: FileText,
  DELIVERY_NOTE: Truck,
  INVOICE: Receipt,
  SKU: Package,
  CUSTOMER: User,
};

const TYPE_LABEL: Record<SearchHitType, string> = {
  PI: 'PI',
  DELIVERY_NOTE: 'Delivery Note',
  INVOICE: 'Invoice',
  SKU: 'SKU',
  CUSTOMER: 'Customer',
};

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: hits = [], isFetching } = useSearch(query);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (piId: string | null) => {
    if (!piId) return;
    setOpen(false);
    setQuery('');
    navigate(`/supply-chain/pi/${piId}`);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search PI, Delivery Note, Invoice, SKU, Customer…"
        className="ps-9"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-40 mt-2 max-h-96 w-full overflow-y-auto rounded-lg border bg-popover p-1.5 shadow-xl">
          {isFetching && hits.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          )}
          {!isFetching && hits.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matches found.</p>
          )}
          {hits.map((hit, i) => {
            const Icon = ICONS[hit.type];
            return (
              <button
                key={`${hit.type}-${hit.label}-${i}`}
                type="button"
                onClick={() => go(hit.piId)}
                disabled={!hit.piId}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-accent',
                  !hit.piId && 'opacity-50',
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">
                  <span className="font-medium">{hit.label}</span>
                  <span className="ms-2 text-xs text-muted-foreground">{hit.sublabel}</span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[hit.type]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
