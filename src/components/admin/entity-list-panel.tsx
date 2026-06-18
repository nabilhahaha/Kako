'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface EntityListItem {
  id: string;
  primary: string;
  secondary?: string;
  /** extra haystack text for search (not displayed) */
  search?: string;
}

/** Above this many filtered rows we render a capped window + a "refine search"
 *  hint — the structure (single scroll container, fixed-height rows, capped
 *  render) is windowing-ready so a virtualizer can be dropped in later. */
const RENDER_CAP = 200;

/**
 * EntityListPanel — left panel: type-ahead search + (optional) filter chips +
 * quick-create slot + selectable list with keyboard navigation. Generic; reused
 * by every admin module. No business logic.
 */
export function EntityListPanel({
  items,
  selectedId,
  onSelect,
  searchPlaceholder,
  filters,
  quickCreate,
  emptyText,
}: {
  items: EntityListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchPlaceholder: string;
  filters?: ReactNode;
  quickCreate?: ReactNode;
  emptyText?: string;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      `${i.primary} ${i.secondary ?? ''} ${i.search ?? ''}`.toLowerCase().includes(needle),
    );
  }, [items, q]);

  const capped = filtered.length > RENDER_CAP ? filtered.slice(0, RENDER_CAP) : filtered;

  // Keep the active index in range and visible.
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (capped.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, capped.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = capped[active]; if (it) onSelect(it.id); }
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
        {filters && <div className="flex flex-wrap gap-1">{filters}</div>}
        {quickCreate}
        <div ref={listRef} className="max-h-[30rem] space-y-1 overflow-auto" role="listbox" aria-activedescendant={capped[active]?.id}>
          {capped.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">{emptyText ?? '—'}</p>
          ) : (
            capped.map((i, idx) => (
              <button
                key={i.id}
                id={i.id}
                data-idx={idx}
                role="option"
                aria-selected={selectedId === i.id}
                onClick={() => { setActive(idx); onSelect(i.id); }}
                onMouseEnter={() => setActive(idx)}
                className={`flex h-10 w-full items-center justify-between gap-2 rounded-md px-2 text-start text-sm ${
                  selectedId === i.id ? 'bg-secondary font-medium' : idx === active ? 'bg-secondary/50' : 'hover:bg-secondary'
                }`}
              >
                <span className="min-w-0 truncate">{i.primary}</span>
                {i.secondary && <span className="ms-2 shrink-0 text-xs text-muted-foreground">{i.secondary}</span>}
              </button>
            ))
          )}
        </div>
        {filtered.length > RENDER_CAP && (
          <p className="px-2 text-center text-[10px] text-muted-foreground">
            {capped.length} / {filtered.length} — {searchPlaceholder}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
