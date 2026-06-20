'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users, Search, Filter, Save, Trash2, UploadCloud, MapPin, MapPinOff, Bookmark } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { DpCustomer } from '@/lib/tis/day-planner-import';
import { loadSegments, saveSegment, deleteSegment, isFilterActive, type SegmentFilter, type RpSegment } from './route-planner-segments';

type FacetKey = 'city' | 'area' | 'salesman' | 'channel' | 'class';

/**
 * Customers screen (redesign Phase B) — a customer-first table over the loaded
 * dataset with search + facet filters (City / Area / Salesman / Channel / Class) and
 * reusable Saved Segments. Reuses the Day Planner's facet logic; standalone /
 * session-friendly (operates on the customers already loaded). The "Import" action
 * routes to the shared import wizard; segments persist to localStorage.
 */
export function CustomersView({ customers, focusSegments = false, onImport }: {
  customers: DpCustomer[];
  focusSegments?: boolean;
  onImport: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Partial<Record<FacetKey, string>>>({});
  const [segments, setSegments] = useState<RpSegment[]>([]);
  const [segName, setSegName] = useState('');

  useEffect(() => { setSegments(loadSegments()); }, []);

  const facets = useMemo(() => {
    const make = (key: FacetKey): [string, number][] => {
      const m = new Map<string, number>();
      for (const c of customers) { const v = ((c[key] ?? '') as string).toString().trim(); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return { city: make('city'), area: make('area'), salesman: make('salesman'), channel: make('channel'), class: make('class') };
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (q && !(c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q))) return false;
      for (const k of ['city', 'area', 'salesman', 'channel', 'class'] as FacetKey[]) {
        if (filter[k] && ((c[k] ?? '') as string).toString().trim() !== filter[k]) return false;
      }
      return true;
    });
  }, [customers, search, filter]);

  const currentFilter: SegmentFilter = { search: search || undefined, ...filter };
  function applySegment(s: RpSegment) {
    setSearch(s.filter.search ?? '');
    setFilter({ city: s.filter.city, area: s.filter.area, salesman: s.filter.salesman, channel: s.filter.channel, class: s.filter.class });
  }
  function onSave() { if (segName.trim()) { setSegments(saveSegment(segName, currentFilter)); setSegName(''); } }
  function clearFilters() { setSearch(''); setFilter({}); }

  const withGps = filtered.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && !(c.lat === 0 && c.lng === 0)).length;

  if (customers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Users className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-lg font-semibold">{t('rpShell.i_customerList')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('rpShell.cust_empty')}</p>
        <Button onClick={onImport}><UploadCloud className="h-4 w-4" /> {t('rpShell.i_importCustomers')}</Button>
        <p className="max-w-md text-xs text-muted-foreground/80">{t('rpShell.rp_session')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <p className="text-sm font-bold">{t('rpShell.i_customerList')}</p>
          <span className="text-xs text-muted-foreground">{filtered.length} / {customers.length} · {withGps} {t('rpShell.cust_withGps')}</span>
        </div>
        <Button size="sm" variant="outline" onClick={onImport}><UploadCloud className="h-4 w-4" /> {t('rpShell.i_importCustomers')}</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative"><Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('dayPlanner.searchPlaceholder')} className="h-8 w-44 ps-7 text-xs" /></div>
        {(['city', 'area', 'salesman', 'channel', 'class'] as FacetKey[]).map((k) => facets[k].length > 0 && (
          <select key={k} value={filter[k] ?? ''} onChange={(e) => setFilter((f) => ({ ...f, [k]: e.target.value || undefined }))} className="h-8 rounded border bg-background px-1 text-[11px]">
            <option value="">{t(`dayPlanner.filter_${k === 'area' ? 'city' : k}` as Parameters<typeof t>[0])}{k === 'area' ? ' / ' + t('dayPlanner.f_area') : ''}</option>
            {facets[k].map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
          </select>
        ))}
        {isFilterActive(currentFilter) && <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-red-600">{t('dayPlanner.clearSel')}</button>}
      </div>

      {/* Save segment + saved list */}
      <div className={`flex flex-wrap items-center gap-1.5 ${focusSegments ? 'rounded-lg border border-primary/40 bg-primary/5 p-2' : ''}`}>
        <Bookmark className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-medium text-muted-foreground">{t('rpShell.cust_segments')}:</span>
        <Input value={segName} onChange={(e) => setSegName(e.target.value)} placeholder={t('rpShell.cust_segName')} className="h-7 w-44 text-[11px]" />
        <button onClick={onSave} disabled={!segName.trim() || !isFilterActive(currentFilter)} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"><Save className="h-3 w-3" /> {t('dayPlanner.tplSave')}</button>
        {segments.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
            <button onClick={() => applySegment(s)} className="hover:text-primary">{s.name}</button>
            <button onClick={() => setSegments(deleteSegment(s.id))} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto rounded border">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {[t('dayPlanner.f_code'), t('dayPlanner.f_name'), t('dayPlanner.f_city'), t('dayPlanner.f_area'), t('dayPlanner.f_channel'), t('dayPlanner.f_class'), t('dayPlanner.f_salesman'), 'GPS'].map((hd) => (
                <th key={hd} className="whitespace-nowrap px-2 py-1.5 text-start font-semibold">{hd}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 2000).map((c) => {
              const gps = Number.isFinite(c.lat) && Number.isFinite(c.lng) && !(c.lat === 0 && c.lng === 0);
              return (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="whitespace-nowrap px-2 py-1 text-muted-foreground" dir="ltr">{c.code ?? ''}</td>
                  <td className="px-2 py-1 font-medium">{c.name}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{c.city ?? ''}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{c.area ?? ''}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{c.channel ?? ''}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{c.class ?? ''}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{c.salesman ?? ''}</td>
                  <td className="px-2 py-1">{gps ? <MapPin className="h-3.5 w-3.5 text-emerald-600" /> : <MapPinOff className="h-3.5 w-3.5 text-red-400" />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
