'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface EntityListItem {
  id: string;
  primary: string;
  secondary?: string;
  /** extra haystack text for search (not displayed) */
  search?: string;
}

/**
 * EntityListPanel — left panel: search + (optional) filter chips + quick-create
 * slot + selectable list. Generic; reused by every admin module. No logic.
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
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      `${i.primary} ${i.secondary ?? ''} ${i.search ?? ''}`.toLowerCase().includes(needle),
    );
  }, [items, q]);

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
        {filters && <div className="flex flex-wrap gap-1">{filters}</div>}
        {quickCreate}
        <div className="max-h-[30rem] space-y-1 overflow-auto" role="listbox">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">{emptyText ?? '—'}</p>
          ) : (
            filtered.map((i) => (
              <button
                key={i.id}
                role="option"
                aria-selected={selectedId === i.id}
                onClick={() => onSelect(i.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-secondary ${selectedId === i.id ? 'bg-secondary font-medium' : ''}`}
              >
                <span className="min-w-0 truncate">{i.primary}</span>
                {i.secondary && <span className="ms-2 shrink-0 text-xs text-muted-foreground">{i.secondary}</span>}
              </button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
