import { useState, useRef, useEffect } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { useSalesFilterStore } from '@/stores/salesFilterStore';

interface Props { dataset: SalesDataset }

type DimKey = 'regions' | 'channels' | 'branches' | 'cities' | 'categories' | 'managers' | 'nsms';

const DIMS: { key: DimKey; label: string }[] = [
  { key: 'regions', label: 'Region' },
  { key: 'channels', label: 'Channel' },
  { key: 'branches', label: 'Branch' },
  { key: 'categories', label: 'Category' },
  { key: 'managers', label: 'Manager' },
  { key: 'nsms', label: 'NSM' },
];

function Pill({
  label, options, selected, onToggle, onClear, onAll,
}: {
  label: string; options: string[]; selected: number[];
  onToggle: (i: number) => void; onClear: () => void; onAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = selected.length > 0;
  const items = options
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`h-[30px] flex items-center gap-1 px-2.5 rounded-md text-[12px] font-medium transition-all border ${
          active
            ? 'bg-primary/[0.08] border-primary/25 text-primary'
            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
        }`}
      >
        <span>{label}</span>
        {active && (
          <span className="ml-0.5 w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <svg className={`w-2.5 h-2.5 opacity-50 ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-56 bg-card border rounded-lg overflow-hidden animate-fade-in"
          style={{ boxShadow: '0 4px 24px rgb(0 0 0 / 0.12), 0 1px 4px rgb(0 0 0 / 0.06)' }}>
          <div className="p-1.5 border-b">
            <input
              autoFocus
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search..."
              className="w-full px-2 py-[5px] text-[12px] rounded border bg-muted/40 outline-none focus:border-primary/30"
            />
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b bg-muted/20">
            <button onClick={onAll} className="text-[11px] font-semibold text-primary hover:underline">Select all</button>
            <span className="text-border text-[10px]">|</span>
            <button onClick={() => { onClear(); }} className="text-[11px] font-semibold text-red-500 hover:underline">Clear</button>
            <span className="ml-auto text-[10px] text-muted-foreground">{items.length} items</span>
          </div>
          <div className="max-h-[220px] overflow-y-auto p-0.5 scrollbar-hide">
            {items.map(({ o, i }) => (
              <label key={i} className="flex items-center gap-2 px-2.5 py-[6px] rounded hover:bg-muted/50 cursor-pointer text-[12px] transition-colors">
                <input
                  type="checkbox"
                  checked={selected.includes(i)}
                  onChange={() => onToggle(i)}
                  className="w-3.5 h-3.5 rounded border-muted-foreground/30 text-primary focus:ring-primary/20 accent-primary"
                />
                <span className="truncate text-foreground/90">{o}</span>
              </label>
            ))}
            {items.length === 0 && <p className="text-center py-3 text-[11px] text-muted-foreground">No results</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function SalesFilterBar({ dataset }: Props) {
  const s = useSalesFilterStore();
  const hasFilters = !!(s.dateFrom || s.dateTo || s.regions.length || s.channels.length ||
    s.branches.length || s.cities.length || s.categories.length || s.managers.length || s.nsms.length);

  return (
    <div className="dash-card px-3 py-2 flex flex-wrap items-center gap-1.5">
      {/* Date range */}
      <div className="flex items-center gap-1 rounded-md border bg-card px-2 h-[30px] text-[12px]">
        <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M1 7h14M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
        <input type="date" value={s.dateFrom || ''} min={dataset.meta.dateMin} max={dataset.meta.dateMax}
          onChange={e => s.setDateRange(e.target.value || null, s.dateTo)}
          className="bg-transparent w-[105px] outline-none font-medium" />
        <span className="text-muted-foreground/40 text-[10px]">—</span>
        <input type="date" value={s.dateTo || ''} min={dataset.meta.dateMin} max={dataset.meta.dateMax}
          onChange={e => s.setDateRange(s.dateFrom, e.target.value || null)}
          className="bg-transparent w-[105px] outline-none font-medium" />
      </div>

      <div className="w-px h-4 bg-border mx-0.5" />

      {DIMS.map(({ key, label }) => (
        <Pill
          key={key}
          label={label}
          options={dataset.dims[key]}
          selected={s[key] as number[]}
          onToggle={i => s.toggleDimension(key, i)}
          onClear={() => s.setDimension(key, [])}
          onAll={() => s.setDimension(key, dataset.dims[key].map((_, i) => i))}
        />
      ))}

      {hasFilters && (
        <button onClick={s.resetAll}
          className="ml-auto h-[30px] px-2.5 text-[11px] font-semibold text-red-500 hover:bg-red-50 rounded-md transition-colors">
          Clear all ×
        </button>
      )}
    </div>
  );
}
