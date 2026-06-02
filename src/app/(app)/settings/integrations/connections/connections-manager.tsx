'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plug, Plus, Ban, PlayCircle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { listConnectorAdapters, getConnectorAdapter } from '@/lib/erp/connectors/registry';
import { createConnection, testConnection, revokeConnection, updateConnection, type ConnectionRow } from './actions';

function SectionHeader({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function ConnectionsManager({ initialConnections }: { initialConnections: ConnectionRow[] }) {
  const { t, locale } = useI18n();
  const adapters = listConnectorAdapters();
  const [rows, setRows] = useState<ConnectionRow[]>(initialConnections);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [adapterKey, setAdapterKey] = useState(adapters[0]?.key ?? '');
  const adapter = getConnectorAdapter(adapterKey);
  const [direction, setDirection] = useState(adapter?.directions[0] ?? 'in');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState('');

  const label = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const setCfg = (k: string, v: string) => setConfig((c) => ({ ...c, [k]: v }));

  function pickAdapter(key: string) {
    setAdapterKey(key);
    const a = getConnectorAdapter(key);
    setDirection(a?.directions[0] ?? 'in');
    setConfig({});
    setSecret('');
  }

  async function create() {
    if (!adapter) return;
    if (!name.trim()) return toast.error(t('integrations.connections.nameRequired'));
    const invalid = adapter.validateConfig(config);
    if (invalid) return toast.error(invalid);
    setBusy(true);
    try {
      const res = await createConnection({
        name: name.trim(), kind: adapter.kind, direction, adapter: adapter.key, config, secret: secret || undefined,
      });
      if (!res.ok || !res.data) return toast.error(res.error ?? t('integrations.connections.error'));
      setRows((r) => [{
        id: res.data!.id, name: name.trim(), kind: adapter.kind, direction, adapter: adapter.key,
        config, hasSecret: !!secret, isActive: true, lastTestAt: null, lastTestOk: null, lastTestMessage: null,
        createdAt: new Date().toISOString(),
      }, ...r]);
      toast.success(t('integrations.connections.created'));
      setName(''); setConfig({}); setSecret('');
    } catch {
      toast.error(t('integrations.connections.error'));
    } finally {
      setBusy(false);
    }
  }

  async function runTest(id: string) {
    setBusy(true);
    try {
      const res = await testConnection(id);
      if (!res.ok || !res.data) return toast.error(res.error ?? t('integrations.connections.error'));
      toast[res.data.ok ? 'success' : 'error'](res.data.message);
      setRows((r) => r.map((x) => (x.id === id ? { ...x, lastTestOk: res.data!.ok, lastTestMessage: res.data!.message, lastTestAt: new Date().toISOString() } : x)));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: ConnectionRow) {
    setBusy(true);
    try {
      const res = await updateConnection(row.id, null, !row.isActive);
      if (!res.ok) return toast.error(res.error ?? t('integrations.connections.error'));
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, isActive: !row.isActive } : x)));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm(t('integrations.connections.revokeConfirm'))) return;
    setBusy(true);
    try {
      const res = await revokeConnection(id);
      if (!res.ok) return toast.error(res.error ?? t('integrations.connections.error'));
      setRows((r) => r.map((x) => (x.id === id ? { ...x, isActive: false } : x)));
      toast.success(t('integrations.connections.revoked'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={Plus} title={t('integrations.connections.newTitle')} hint={t('integrations.connections.newHint')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cx-name">{t('integrations.connections.name')}</Label>
              <Input id="cx-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('integrations.connections.namePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cx-adapter">{t('integrations.connections.adapter')}</Label>
              <Select id="cx-adapter" value={adapterKey} onChange={(e) => pickAdapter(e.target.value)}>
                {adapters.map((a) => <option key={a.key} value={a.key}>{label(a.labelEn, a.labelAr)}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cx-direction">{t('integrations.connections.direction')}</Label>
              <Select id="cx-direction" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
                {(adapter?.directions ?? ['in']).map((d) => <option key={d} value={d}>{t(`integrations.connections.dir.${d}`)}</option>)}
              </Select>
            </div>
          </div>

          {/* adapter-specific config */}
          {adapter && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {adapter.configFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`cx-${f.key}`}>{label(f.labelEn, f.labelAr)}{f.required && <span className="text-destructive"> *</span>}</Label>
                  {f.type === 'select' ? (
                    <Select id={`cx-${f.key}`} value={config[f.key] ?? ''} onChange={(e) => setCfg(f.key, e.target.value)}>
                      <option value="">—</option>
                      {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{label(o.labelEn, o.labelAr)}</option>)}
                    </Select>
                  ) : (
                    <Input id={`cx-${f.key}`} type={f.type === 'number' ? 'number' : 'text'} dir={f.type === 'text' || f.type === 'number' ? 'ltr' : undefined}
                      value={config[f.key] ?? ''} onChange={(e) => setCfg(f.key, e.target.value)} placeholder={f.placeholder} />
                  )}
                </div>
              ))}
              {adapter.secretField && (
                <div className="space-y-1.5">
                  <Label htmlFor="cx-secret">{label(adapter.secretField.labelEn, adapter.secretField.labelAr)}</Label>
                  <Input id="cx-secret" type="password" dir="ltr" value={secret} onChange={(e) => setSecret(e.target.value)}
                    placeholder={t('integrations.connections.secretPlaceholder')} />
                  <p className="text-xs text-muted-foreground">{t('integrations.connections.secretVault')}</p>
                </div>
              )}
            </div>
          )}
          <Button disabled={busy} onClick={create} className="w-full sm:w-auto">
            <Plug className="h-4 w-4" /> {t('integrations.connections.create')}
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={Plug} title={t('integrations.connections.listTitle')} />
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('integrations.connections.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.connections.name')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.connections.adapter')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.connections.direction')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.connections.lastTest')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.connections.status')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('integrations.connections.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-t transition-colors hover:bg-secondary/30">
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2">{label(getConnectorAdapter(c.adapter)?.labelEn ?? c.adapter, getConnectorAdapter(c.adapter)?.labelAr ?? c.adapter)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{t(`integrations.connections.dir.${c.direction}`)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c.lastTestAt ? (
                          <span className="inline-flex items-center gap-1">
                            {c.lastTestOk ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                            <span className="text-xs text-muted-foreground">{formatDate(c.lastTestAt, INTL_LOCALE[locale])}</span>
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2"><Badge variant={c.isActive ? 'success' : 'secondary'}>{c.isActive ? t('integrations.connections.active') : t('integrations.connections.inactive')}</Badge></td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => runTest(c.id)}>
                            <PlayCircle className="h-3.5 w-3.5" /> {t('integrations.connections.test')}
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => toggle(c)}>
                            {c.isActive ? t('integrations.connections.disable') : t('integrations.connections.enable')}
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => revoke(c.id)}>
                            <Ban className="h-3.5 w-3.5 text-destructive" /> {t('integrations.connections.revoke')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
