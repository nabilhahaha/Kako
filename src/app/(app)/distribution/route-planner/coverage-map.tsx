'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Link from 'next/link';
import {
  Map as MapIcon, RefreshCw, Loader2, X, Store, CheckCircle2, Clock,
  Navigation, FileBarChart, Search, AlertTriangle,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getFvCoverage } from './rp-coverage-actions';
import { getVerificationPhotos } from './rp-verification-actions';
import { openGoogleMapsNavigation } from './fv-nav';
import {
  coverageCounters, coverageGeoJSON, coveragePhotoIds, type CoverageRow, type CoverageStatus,
} from './fv-coverage';

type Preset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';
const SRC = 'fv-coverage';
const RASTER_STYLE = {
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

function rangeForPreset(preset: Preset, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  if (preset === 'all') return { from: null, to: null };
  if (preset === 'custom') {
    return { from: customFrom ? new Date(customFrom).toISOString() : null, to: customTo ? new Date(`${customTo}T23:59:59`).toISOString() : null };
  }
  const now = new Date();
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today') return { from: sod.toISOString(), to: now.toISOString() };
  if (preset === 'yesterday') {
    const y = new Date(sod); y.setDate(y.getDate() - 1);
    const e = new Date(sod); e.setMilliseconds(-1);
    return { from: y.toISOString(), to: e.toISOString() };
  }
  if (preset === 'week') { const s = new Date(sod); s.setDate(s.getDate() - s.getDay()); return { from: s.toISOString(), to: now.toISOString() }; }
  // month
  const s = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: s.toISOString(), to: now.toISOString() };
}

/** Coverage Map — read-only management dashboard (admin / viewer / supervisor scope). */
export function CoverageMap() {
  const { t, locale } = useI18n();
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  // filters
  const [preset, setPreset] = useState<Preset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [salesman, setSalesman] = useState('');
  const [status, setStatus] = useState<'' | CoverageStatus>('');
  const [datasetId, setDatasetId] = useState('');
  const [search, setSearch] = useState('');

  // data
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [selected, setSelected] = useState<CoverageRow | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  // filter option facets, captured from the first unfiltered load so they stay stable
  const [repOptions, setRepOptions] = useState<{ email: string; name: string }[]>([]);
  const [datasetOptions, setDatasetOptions] = useState<{ id: string; name: string }[]>([]);
  const facetsLoaded = useRef(false);

  const counters = useMemo(() => coverageCounters(rows), [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = rangeForPreset(preset, customFrom, customTo);
    const res = await getFvCoverage({ from, to, salesman: salesman || null, status: status || null, datasetId: datasetId || null, search: search || null });
    if (res.ok) {
      setRows(res.data);
      setLastUpdated(Date.now());
      if (!facetsLoaded.current) {
        const reps = new Map<string, string>();
        const dss = new Map<string, string>();
        for (const r of res.data) {
          if (r.salesman) reps.set(r.salesman, r.assignedRep || r.salesman);
          if (r.datasetId) dss.set(r.datasetId, r.datasetName || r.datasetId);
        }
        setRepOptions([...reps].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name)));
        setDatasetOptions([...dss].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
        facetsLoaded.current = true;
      }
    }
    setLoading(false);
  }, [preset, customFrom, customTo, salesman, status, datasetId, search]);

  // debounce search; immediate for the rest
  useEffect(() => { const id = window.setTimeout(() => void load(), search ? 350 : 0); return () => window.clearTimeout(id); }, [load, search]);

  // init map once
  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: holder.current, style: RASTER_STYLE, center: [46.7, 24.7], zoom: 4, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({ showUserLocation: true, trackUserLocation: false }), 'top-right');
    mapRef.current = map;
    map.on('load', () => {
      map.addSource(SRC, { type: 'geojson', data: coverageGeoJSON([]) });
      map.addLayer({
        id: 'points', type: 'circle', source: SRC,
        paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 12, 8, 16, 11], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      });
      const openFrom = (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) setSelected((cur) => rowsRef.current.find((r) => r.customerId === id) ?? cur);
      };
      map.on('click', 'points', openFrom);
      map.on('mouseenter', 'points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'points', () => { map.getCanvas().style.cursor = ''; });
      setReady(true);
    });
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep a ref of rows for the (once-bound) click handler
  const rowsRef = useRef<CoverageRow[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // push data + fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(coverageGeoJSON(rows));
    const valid = rows.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && !(r.lat === 0 && r.lng === 0));
    if (valid.length > 0) {
      const b = new maplibregl.LngLatBounds();
      for (const r of valid) b.extend([r.lng as number, r.lat as number]);
      map.fitBounds(b, { padding: 56, maxZoom: 14, duration: 0 });
    }
  }, [rows, ready]);

  // lazy photos when a visited customer is opened
  useEffect(() => {
    setPhotoUrls([]);
    if (!selected || !selected.visited) return;
    const ids = coveragePhotoIds(selected);
    if (ids.length === 0) return;
    let cancelled = false;
    setPhotosLoading(true);
    void getVerificationPhotos(ids).then((res) => { if (!cancelled && res.ok) setPhotoUrls(res.data.map((p) => p.url)); }).finally(() => { if (!cancelled) setPhotosLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const kpis: { label: string; value: string; tone?: 'green' | 'red' }[] = [
    { label: t('rpCoverage.kpiTotal'), value: String(counters.total) },
    { label: t('rpCoverage.kpiVisited'), value: String(counters.visited), tone: 'green' },
    { label: t('rpCoverage.kpiNotVisited'), value: String(counters.pending), tone: 'red' },
    { label: t('rpCoverage.kpiCoverage'), value: `${counters.coveragePct}%` },
    { label: t('rpCoverage.kpiPhotos'), value: String(counters.photos) },
    { label: t('rpCoverage.kpiUpdated'), value: lastUpdated ? new Date(lastUpdated).toLocaleTimeString(locale === 'ar' ? 'ar' : 'en') : '—' },
  ];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-3 lg:h-[calc(100vh-1rem)] lg:p-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold"><MapIcon className="h-5 w-5" />{t('rpCoverage.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('rpCoverage.subtitle')}</p>
        </div>
        <button onClick={() => { facetsLoaded.current = false; void load(); }} disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50 disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{t('rpCoverage.refresh')}
        </button>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="h-9 rounded-lg border bg-background px-2 text-xs font-semibold">
          {(['all', 'today', 'yesterday', 'week', 'month', 'custom'] as Preset[]).map((p) => <option key={p} value={p}>{t(`rpCoverage.date_${p}`)}</option>)}
        </select>
        {preset === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs" />
          </>
        )}
        <select value={salesman} onChange={(e) => setSalesman(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs font-semibold">
          <option value="">{t('rpCoverage.allReps')}</option>
          {repOptions.map((r) => <option key={r.email} value={r.email}>{r.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | CoverageStatus)} className="h-9 rounded-lg border bg-background px-2 text-xs font-semibold">
          <option value="">{t('rpCoverage.allStatus')}</option>
          <option value="visited">{t('rpCoverage.statusVisited')}</option>
          <option value="pending">{t('rpCoverage.statusPending')}</option>
        </select>
        <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs font-semibold">
          <option value="">{t('rpCoverage.allLists')}</option>
          {datasetOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="flex h-9 items-center gap-1.5 rounded-lg border bg-background px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('rpCoverage.searchPlaceholder')} className="w-40 bg-transparent text-xs outline-none" />
          {search && <button onClick={() => setSearch('')} aria-label={t('common.close')}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">{k.label}</p>
            <p className={`text-lg font-extrabold ${k.tone === 'green' ? 'text-emerald-600' : k.tone === 'red' ? 'text-red-600' : ''}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* map + detail */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border">
        <div className="absolute left-3 top-3 z-10 flex items-center gap-3 rounded-full border bg-background/95 px-3 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />{t('rpCoverage.statusVisited')}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-600" />{t('rpCoverage.statusPending')}</span>
        </div>
        <div ref={holder} className="h-full w-full" />

        {selected && (
          <DetailPanel row={selected} t={t} locale={locale} photoUrls={photoUrls} photosLoading={photosLoading} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

function DetailPanel({ row, t, locale, photoUrls, photosLoading, onClose }: {
  row: CoverageRow;
  t: (k: string, p?: Record<string, string | number>) => string;
  locale: string;
  photoUrls: string[];
  photosLoading: boolean;
  onClose: () => void;
}) {
  const nav = Number.isFinite(row.lat) && Number.isFinite(row.lng) && !(row.lat === 0 && row.lng === 0);
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 max-h-[70%] overflow-auto rounded-t-2xl border-t bg-background p-4 shadow-2xl lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-96 lg:rounded-none lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.code ?? ''}</p>
        </div>
        <button onClick={onClose} aria-label={t('common.close')} className="flex h-8 w-8 items-center justify-center rounded-full border"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        {row.visited
          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{t('rpCoverage.statusVisited')}</span>
          : <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700"><Clock className="h-3.5 w-3.5" />{t('rpCoverage.statusPending')}</span>}
        {row.radiusEnforced === false && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700"><AlertTriangle className="h-3 w-3" />{t('rpVerify.radiusWaived')}</span>}
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        <Row label={t('rpCoverage.assignedRep')} value={row.assignedRep || row.salesman} />
        <Row label={t('rpCoverage.cityArea')} value={[row.city, row.area].filter(Boolean).join(' · ') || null} />
        <Row label={t('rpCoverage.channel')} value={row.channel} />
        <Row label={t('rpCoverage.list')} value={row.datasetName} />
        {row.visited && <Row label={t('rpCoverage.lastVisit')} value={row.verifiedAt ? new Date(row.verifiedAt).toLocaleString(locale === 'ar' ? 'ar' : 'en') : null} />}
        {row.visited && row.distanceM != null && <Row label={t('rpCoverage.distance')} value={t('rpVerify.metersAway', { n: row.distanceM })} />}
        {row.notes && <Row label={t('rpCoverage.notes')} value={row.notes} />}
      </dl>

      {row.visited && coveragePhotoIds(row).length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('rpCoverage.photos')}</p>
          {photosLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photoUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="aspect-square w-full rounded-lg border object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2">
        <Link href="/field-verification/reports" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-bold"><Store className="h-4 w-4" />{t('rpCoverage.openCustomer')}</Link>
        <Link href="/field-verification/reports" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-bold"><FileBarChart className="h-4 w-4" />{t('rpCoverage.openReport')}</Link>
        {nav && (
          <button onClick={() => openGoogleMapsNavigation(row.lat as number, row.lng as number)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            <Navigation className="h-4 w-4" />{t('rpCoverage.navigate')}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-end font-semibold">{value}</dd>
    </div>
  );
}
