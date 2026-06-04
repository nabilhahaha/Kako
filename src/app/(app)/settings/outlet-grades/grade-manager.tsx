'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { createGrade, deleteGrade, setFactorWeight, seedDefaultGrading, recomputeGrades } from './actions';

export interface GradeData {
  bands: { id: string; code: string; name: string; name_ar: string | null; min_score: number; rank: number; is_active: boolean }[];
  factors: { factor: string; weight: number }[];
}

const FACTOR_KEYS = ['sales_value', 'sales_quantity', 'visit_frequency', 'msl_compliance', 'distribution', 'perfect_store', 'collection'];

export function GradeManager({ data }: { data: GradeData }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const weightOf = new Map(data.factors.map((f) => [f.factor, f.weight]));

  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [minScore, setMinScore] = useState(''); const [rank, setRank] = useState('');

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('retail.grade.error')); return false; }
      toast.success(okMsg ?? t('retail.grade.saved'));
      router.refresh();
      return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => run(seedDefaultGrading)}><Sparkles className="h-4 w-4" /> {t('retail.grade.seed')}</Button>
        <Button disabled={busy} onClick={async () => { const res = await recomputeGrades(); if (!res.ok || !res.data) { toast.error(res.error ?? t('retail.grade.error')); return; } toast.success(t('retail.grade.recomputed', { count: res.data.count })); router.refresh(); }}>
          <RefreshCw className="h-4 w-4" /> {t('retail.grade.recompute')}
        </Button>
      </div>

      {/* Bands */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('retail.grade.bands')}</h2>
          {data.bands.length === 0 ? <p className="text-xs text-muted-foreground">{t('retail.grade.noBands')}</p> : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground"><tr>
                  <th className="px-3 py-2 text-start font-medium">{t('retail.grade.code')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('retail.grade.name')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('retail.grade.minScore')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('retail.grade.rank')}</th>
                  <th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {data.bands.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2"><Badge variant="secondary">{b.code}</Badge></td>
                      <td className="px-3 py-2">{b.name}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{b.min_score}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{b.rank}</td>
                      <td className="px-3 py-2 text-end"><Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => deleteGrade(b.id), t('retail.grade.deleted'))}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Input className="h-9 w-24" placeholder={t('retail.grade.code')} value={code} onChange={(e) => setCode(e.target.value)} />
            <Input className="h-9 w-40" placeholder={t('retail.grade.name')} value={name} onChange={(e) => setName(e.target.value)} />
            <Input className="h-9 w-24" type="number" placeholder={t('retail.grade.minScore')} value={minScore} onChange={(e) => setMinScore(e.target.value)} />
            <Input className="h-9 w-20" type="number" placeholder={t('retail.grade.rank')} value={rank} onChange={(e) => setRank(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={busy || !code || !name}
              onClick={async () => { if (await run(() => createGrade({ code, name, minScore: Number(minScore) || 0, rank: Number(rank) || 0 }))) { setCode(''); setName(''); setMinScore(''); setRank(''); } }}>
              <Plus className="h-4 w-4" /> {t('retail.grade.addBand')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Factor weights */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('retail.grade.factors')}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FACTOR_KEYS.map((f) => (
              <label key={f} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span>{t(`retail.grade.factorKeys.${f}`)}</span>
                <Input className="h-8 w-24" type="number" step="0.05" defaultValue={weightOf.get(f) ?? 0}
                  onBlur={(e) => run(() => setFactorWeight(f, Number(e.target.value) || 0))} />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
