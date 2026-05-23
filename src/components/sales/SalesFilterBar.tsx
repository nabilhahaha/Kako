import { useState, useRef, useEffect } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { useSalesFilterStore } from '@/stores/salesFilterStore';

interface Props {
  dataset: SalesDataset;
}

type DimKey = 'regions' | 'channels' | 'branches' | 'cities' | 'categories' | 'managers' | 'nsms';

const DIMENSION_CONFIG: { key: DimKey; filterKey: DimKey; label: string; labelUk: string }[] = [
  { key: 'regions', filterKey: 'regions', label: 'Region', labelUk: 'Регіон' },
  { key: 'channels', filterKey: 'channels', label: 'Channel', labelUk: 'Канал' },
  { key: 'branches', filterKey: 'branches', label: 'Branch', labelUk: 'Філія' },
  { key: 'categories', filterKey: 'categories', label: 'Category', labelUk: 'Категорія' },
  { key: 'managers', filterKey: 'managers', label: 'Manager', labelUk: 'Менеджер' },
  { key: 'nsms', filterKey: 'nsms', label: 'NSM', labelUk: 'NSM' },
];

function DimFilter({
  label, options, selected, onToggle, onClear, onSelectAll,
}: {
  label: string; options: string[]; selected: number[];
  onToggle: (idx: number) => void; onClear: () => void; onSelectAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = options
    .map((opt, idx) => ({ opt, idx }))
    .filter(({ opt }) => opt.toLowerCase().includes(search.toLowerCase()));

  const active = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`group flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium transition-all ${
          active
            ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
            : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <span className="truncate max-w-[80px]">{label}</span>
        {active && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
            {selected.length}
          </span>
        )}
        <svg className={`w-3 h-3 opacity-40 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 start-0 z-50 bg-card border rounded-xl shadow-lg shadow-black/5 w-60 max-h-80 overflow-hidden flex flex-col animate-fade-in">
          <div className="p-2 border-b space-y-1.5">
            <input
              type="text"
              placeholder={`Search...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="dash-input !py-1.5 !text-[13px]"
              autoFocus
            />
            <div className="flex gap-1.5">
              <button onClick={onSelectAll} className="text-[11px] font-medium text-primary hover:underline">All</button>
              <span className="text-border">|</span>
              <button onClick={onClear} className="text-[11px] font-medium text-red-500 hover:underline">Clear</button>
            </div>
          </div>
          <div className="overflow-y-auto p-1 scrollbar-hide">
            {filtered.map(({ opt, idx }) => (
              <label
                key={idx}
                className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg hover:bg-muted/70 cursor-pointer text-[13px] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(idx)}
                  onChange={() => onToggle(idx)}
                  className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary/20"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SalesFilterBar({ dataset }: Props) {
  const store = useSalesFilterStore();
  const hasFilters = store.dateFrom || store.dateTo || store.regions.length || store.channels.length ||
    store.branches.length || store.cities.length || store.categories.length || store.managers.length || store.nsms.length;

  return (
    <div className="dash-card p-2.5 flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-2 h-8">
        <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <input
          type="date"
          value={store.dateFrom || ''}
          min={dataset.meta.dateMin}
          max={dataset.meta.dateMax}
          onChange={(e) => store.setDateRange(e.target.value || null, store.dateTo)}
          className="bg-transparent text-[13px] font-medium outline-none w-[110px]"
        />
        <span className="text-muted-foreground/40">—</span>
        <input
          type="date"
          value={store.dateTo || ''}
          min={dataset.meta.dateMin}
          max={dataset.meta.dateMax}
          onChange={(e) => store.setDateRange(store.dateFrom, e.target.value || null)}
          className="bg-transparent text-[13px] font-medium outline-none w-[110px]"
        />
      </div>

      <div className="w-px h-5 bg-border/60 mx-0.5" />

      {DIMENSION_CONFIG.map(({ key, filterKey, label }) => (
        <DimFilter
          key={key}
          label={label}
          options={dataset.dims[key]}
          selected={store[filterKey] as number[]}
          onToggle={(idx) => store.toggleDimension(filterKey, idx)}
          onClear={() => store.setDimension(filterKey, [])}
          onSelectAll={() => store.setDimension(filterKey, dataset.dims[key].map((_, i) => i))}
        />
      ))}

      {hasFilters && (
        <>
          <div className="w-px h-5 bg-border/60 mx-0.5" />
          <button
            onClick={store.resetAll}
            className="h-8 px-3 text-[13px] font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  );
}
