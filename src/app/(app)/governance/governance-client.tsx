'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronRight, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { saveChange } from './gov-actions';

export interface Change { id: string; config_type: string; config_ref: string; title: string; state: string; version: number; payload: { enabled?: boolean } }
const AUD = ['all', 'role', 'region', 'branch', 'route', 'team', 'user'];
const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
const STATE_TONE: Record<string, string> = { published: 'border-green-500/50 text-green-700', review: 'border-amber-500/50 text-amber-700', rolled_back: 'text-muted-foreground' };

/** Change list + create-draft form (admin). */
export function GovernanceClient({ changes }: { changes: Change[]; activeState: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', config_type: 'feature_flag', config_ref: '', enabled: true, audience_kind: 'all', audience_ids: '', pilot_ids: '' });

  function create() {
    if (!f.title.trim() || !f.config_ref.trim()) return;
    start(async () => {
      const res = await saveChange({
        title: f.title, config_type: f.config_type, config_ref: f.config_ref, enabled: f.enabled,
        kind: f.config_type === 'module' ? 'module' : 'feature', audience_kind: f.audience_kind,
        audience_ids: f.audience_ids.split(',').map((s) => s.trim()).filter(Boolean), pilot_ids: f.pilot_ids.split(',').map((s) => s.trim()).filter(Boolean),
      });
      if (!res.ok) { toast.error(res.error ?? t('governance.saveFailed')); return; }
      toast.success(t('governance.saved')); setOpen(false);
      if (res.data?.id) router.push(`/governance/${res.data.id}`); else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-3">
        {!open ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="me-1 h-4 w-4" />{t('governance.new')}</Button> : (
          <div className="space-y-2">
            <Input className="h-9" placeholder={t('governance.name')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <select className={selectCls} value={f.config_type} onChange={(e) => setF({ ...f, config_type: e.target.value })}>
                <option value="feature_flag">{t('governance.kindFeature')}</option><option value="module">{t('governance.kindModule')}</option>
              </select>
              <Input className="h-9 w-44" placeholder={t('governance.configRef')} value={f.config_ref} onChange={(e) => setF({ ...f, config_ref: e.target.value })} />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />{t('governance.enabled')}</label>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className={selectCls} value={f.audience_kind} onChange={(e) => setF({ ...f, audience_kind: e.target.value })}>
                {AUD.map((a) => <option key={a} value={a}>{t(`governance.audience.${a}`)}</option>)}
              </select>
              {f.audience_kind !== 'all' && <Input className="h-9 w-44" placeholder={t('governance.audience.ids')} value={f.audience_ids} onChange={(e) => setF({ ...f, audience_ids: e.target.value })} />}
              <Input className="h-9 w-44" placeholder={t('governance.pilot.title')} value={f.pilot_ids} onChange={(e) => setF({ ...f, pilot_ids: e.target.value })} title={t('governance.pilot.hint')} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={create} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('governance.create')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('governance.audience.all') && '×'}</Button>
            </div>
          </div>
        )}
      </CardContent></Card>

      {changes.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('governance.empty')}</CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {changes.map((c) => (
            <Link key={c.id} href={`/governance/${c.id}`} className="block hover:bg-muted/50">
              <div className="flex items-center gap-2 p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><span className="truncate font-medium">{c.title}</span><Badge variant="outline" className={STATE_TONE[c.state]}>{t(`governance.st.${c.state}`)}</Badge></div>
                  <div className="text-[11px] text-muted-foreground">{c.config_type} · {c.config_ref} · v{c.version}</div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
              </div>
            </Link>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}
