'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Database, FileSpreadsheet, FileJson, FileText, Download, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { exportCount } from './actions';

/** ── Generic, registry-driven Export panel ─────────────────────────────────
 *  Pick an entity → set filters → choose a format → download. Nothing here is
 *  entity-specific; the selected descriptor drives the column list. The download
 *  is a GET to /api/export (auth + permission + company scope enforced there). */

export interface ExportEntityField { key: string; labelAr: string; labelEn: string }
export interface ExportEntity {
  key: string;
  labelAr: string;
  labelEn: string;
  fields: ExportEntityField[];
}

type Format = 'csv' | 'xlsx' | 'json';

const FORMATS: { key: Format; icon: typeof FileText }[] = [
  { key: 'csv', icon: FileText },
  { key: 'xlsx', icon: FileSpreadsheet },
  { key: 'json', icon: FileJson },
];

export function ExportPanel({ entities }: { entities: ExportEntity[] }) {
  const { t, locale } = useI18n();
  const label = (e: { labelAr: string; labelEn: string }) => (locale === 'ar' ? e.labelAr : e.labelEn);

  const [entityKey, setEntityKey] = useState<string>(entities[0]?.key ?? '');
  const [format, setFormat] = useState<Format>('csv');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState('10000');
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const entity = useMemo(() => entities.find((e) => e.key === entityKey) ?? null, [entities, entityKey]);

  function buildUrl(): string {
    const p = new URLSearchParams({ entity: entityKey, format });
    if (q.trim()) p.set('q', q.trim());
    if (status.trim()) p.set('status', status.trim());
    if (limit.trim()) p.set('limit', limit.trim());
    return `/api/export?${p.toString()}`;
  }

  async function preview() {
    if (!entity) return;
    setCounting(true);
    setCount(null);
    try {
      const res = await exportCount(entityKey, q, status);
      if (!res.ok) {
        toast.error(res.error ?? t('dataExport.toast.previewError'));
        return;
      }
      setCount(res.count ?? 0);
    } catch {
      toast.error(t('dataExport.toast.previewError'));
    } finally {
      setCounting(false);
    }
  }

  function download() {
    if (!entityKey) return toast.error(t('dataExport.toast.selectEntity'));
    // Navigating to a route that returns Content-Disposition: attachment
    // triggers a download without leaving the page.
    window.location.href = buildUrl();
    toast.success(t('dataExport.toast.started'));
  }

  if (entities.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          {t('dataExport.empty')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* Entity */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Database className="h-4 w-4" /> {t('dataExport.entity.title')}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entities.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => { setEntityKey(e.key); setCount(null); }}
                className={cn(
                  'rounded-lg border p-4 text-start transition-colors hover:border-primary/60 hover:bg-secondary/40',
                  entityKey === e.key ? 'border-primary bg-primary/5' : 'border-input',
                )}
              >
                <div className="font-medium">{label(e)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('dataExport.entity.fieldsCount', { count: e.fields.length })}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Columns preview */}
        {entity && (
          <div className="space-y-2">
            <div className="text-sm font-medium">{t('dataExport.columns.title')}</div>
            <div className="flex flex-wrap gap-2">
              {entity.fields.map((f) => (
                <Badge key={f.key} variant="secondary">{label(f)}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{t('dataExport.filters.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('dataExport.filters.hint')}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="exp-q">{t('dataExport.filters.search')}</Label>
              <Input id="exp-q" value={q} onChange={(e) => { setQ(e.target.value); setCount(null); }}
                placeholder={t('dataExport.filters.searchPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-status">{t('dataExport.filters.status')}</Label>
              <Input id="exp-status" value={status} onChange={(e) => { setStatus(e.target.value); setCount(null); }}
                placeholder={t('dataExport.filters.statusPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-limit">{t('dataExport.filters.limit')}</Label>
              <Input id="exp-limit" type="number" min={1} max={50000} value={limit}
                onChange={(e) => setLimit(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={preview} disabled={counting || !entity}>
              <RefreshCw className={cn('h-4 w-4', counting && 'animate-spin')} />
              {t('dataExport.filters.preview')}
            </Button>
            {count !== null && (
              <span className="text-sm text-muted-foreground">
                {t('dataExport.filters.matchCount', { count })}
              </span>
            )}
          </div>
        </div>

        {/* Format + download */}
        <div className="space-y-3 border-t pt-5">
          <h2 className="text-base font-semibold">{t('dataExport.format.title')}</h2>
          <div className="flex flex-wrap gap-3">
            {FORMATS.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFormat(f.key)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors hover:border-primary/60',
                    format === f.key ? 'border-primary bg-primary/5 font-medium' : 'border-input',
                  )}
                >
                  <Icon className="h-4 w-4" /> {t(`dataExport.format.${f.key}`)}
                </button>
              );
            })}
          </div>
          <Button onClick={download} disabled={!entityKey}>
            <Download className="h-4 w-4" /> {t('dataExport.download')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
