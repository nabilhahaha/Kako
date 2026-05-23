import { useState, useRef, useEffect } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { useSalesFilterStore } from '@/stores/salesFilterStore';

interface Props {
  dataset: SalesDataset;
}

type DimKey = 'regions' | 'channels' | 'branches' | 'cities' | 'categories' | 'managers' | 'nsms';

const DIMENSION_CONFIG: {
  key: DimKey;
  filterKey: DimKey;
  label: string;
  icon: string;
}[] = [
  { key: 'regions', filterKey: 'regions', label: 'Region', icon: '🌍' },
  { key: 'channels', filterKey: 'channels', label: 'Channel', icon: '🏪' },
  { key: 'branches', filterKey: 'branches', label: 'Branch', icon: '🏢' },
  { key: 'categories', filterKey: 'categories', label: 'Category', icon: '📦' },
  { key: 'managers', filterKey: 'managers', label: 'Manager', icon: '👔' },
  { key: 'nsms', filterKey: 'nsms', label: 'NSM', icon: '🎖️' },
];

function DimFilter({
  label,
  icon,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  icon: string;
  options: string[];
  selected: number[];
  onToggle: (idx: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = options
    .map((opt, idx) => ({ opt, idx }))
    .filter(({ opt }) => opt.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
          selected.length > 0
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-card border-border text-foreground hover:bg-muted'
        }`}
      >
        <span>{icon}</span>
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
            {selected.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-1 start-0 z-50 bg-card border rounded-xl shadow-xl w-64 max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b flex gap-2">
            <input
              type="text"
              placeholder={`Search ${label}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-2 py-1 text-sm border rounded-lg bg-background"
              autoFocus
            />
            {selected.length > 0 && (
              <button
                onClick={onClear}
                className="text-xs text-red-500 hover:text-red-700 font-medium whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
          <div className="overflow-y-auto p-1">
            {filtered.map(({ opt, idx }) => (
              <label
                key={idx}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(idx)}
                  onChange={() => onToggle(idx)}
                  className="rounded"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SalesFilterBar({ dataset }: Props) {
  const store = useSalesFilterStore();

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-card rounded-xl border">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">📅</span>
        <input
          type="date"
          value={store.dateFrom || ''}
          min={dataset.meta.dateMin}
          max={dataset.meta.dateMax}
          onChange={(e) => store.setDateRange(e.target.value || null, store.dateTo)}
          className="px-2 py-1 text-sm border rounded-lg bg-background"
        />
        <span className="text-muted-foreground">→</span>
        <input
          type="date"
          value={store.dateTo || ''}
          min={dataset.meta.dateMin}
          max={dataset.meta.dateMax}
          onChange={(e) => store.setDateRange(store.dateFrom, e.target.value || null)}
          className="px-2 py-1 text-sm border rounded-lg bg-background"
        />
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {DIMENSION_CONFIG.map(({ key, filterKey, label, icon }) => (
        <DimFilter
          key={key}
          label={label}
          icon={icon}
          options={dataset.dims[key]}
          selected={store[filterKey] as number[]}
          onToggle={(idx) => store.toggleDimension(filterKey, idx)}
          onClear={() => store.setDimension(filterKey, [])}
        />
      ))}

      <button
        onClick={store.resetAll}
        className="ms-auto px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground border rounded-lg hover:bg-muted transition-colors"
      >
        ↺ Reset
      </button>
    </div>
  );
}
