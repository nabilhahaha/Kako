'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Webhook, Plus, ShieldAlert, Copy, Check, Ban, Send, ScrollText, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { webhookEventsByEntity } from '@/lib/erp/webhooks';
import { getEntity } from '@/lib/erp/entities';
import { createWebhook, revokeWebhook, sendTestWebhook, type WebhookRow, type DeliveryRow } from './actions';

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

const statusVariant = (s: string): 'success' | 'warning' | 'secondary' | 'destructive' =>
  s === 'delivered' ? 'success' : s === 'failed' || s === 'sent' || s === 'pending' ? 'warning' : s === 'dead' ? 'destructive' : 'secondary';

export function WebhooksManager({ initialHooks, initialDeliveries }: { initialHooks: WebhookRow[]; initialDeliveries: DeliveryRow[] }) {
  const { t, locale } = useI18n();
  const [hooks, setHooks] = useState<WebhookRow[]>(initialHooks);
  const [deliveries] = useState<DeliveryRow[]>(initialDeliveries);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const grouped = webhookEventsByEntity();
  const selected = Object.keys(events).filter((e) => events[e]);
  const toggle = (e: string) => setEvents((c) => ({ ...c, [e]: !c[e] }));
  const entityLabel = (key: string) =>
    key === 'approval' ? t('integrations.webhooks.approval') : (locale === 'ar' ? getEntity(key)?.labelAr : getEntity(key)?.labelEn) || key;

  async function create() {
    if (!name.trim()) return toast.error(t('integrations.webhooks.nameRequired'));
    if (!/^https:\/\//i.test(url.trim())) return toast.error(t('integrations.webhooks.urlInvalid'));
    if (selected.length === 0) return toast.error(t('integrations.webhooks.eventRequired'));
    setBusy(true);
    try {
      const res = await createWebhook(name.trim(), url.trim(), selected);
      if (!res.ok || !res.data) return toast.error(res.error ?? t('integrations.webhooks.error'));
      setCreated({ secret: res.data.secret });
      setHooks((h) => [
        { id: res.data!.id, name: name.trim(), url: url.trim(), events: selected, isActive: true, disabledReason: null, lastDeliveryAt: null, createdAt: new Date().toISOString() },
        ...h,
      ]);
      setName(''); setUrl(''); setEvents({});
    } catch {
      toast.error(t('integrations.webhooks.error'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm(t('integrations.webhooks.revokeConfirm'))) return;
    setBusy(true);
    try {
      const res = await revokeWebhook(id);
      if (!res.ok) return toast.error(res.error ?? t('integrations.webhooks.error'));
      setHooks((h) => h.map((x) => (x.id === id ? { ...x, isActive: false } : x)));
      toast.success(t('integrations.webhooks.revoked'));
    } finally {
      setBusy(false);
    }
  }

  async function test(id: string) {
    setBusy(true);
    try {
      const res = await sendTestWebhook(id);
      if (!res.ok) return toast.error(res.error ?? t('integrations.webhooks.error'));
      toast.success(t('integrations.webhooks.testQueued'));
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  }

  return (
    <div className="space-y-6">
      {created && (
        <Card className="border-accent/40">
          <CardContent className="space-y-3 p-6">
            <SectionHeader icon={ShieldAlert} title={t('integrations.webhooks.createdTitle')} hint={t('integrations.webhooks.createdHint')} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code dir="ltr" className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm">{created.secret}</code>
              <Button variant="outline" onClick={copySecret} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {copied ? t('integrations.webhooks.copied') : t('integrations.webhooks.copy')}
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>{t('integrations.webhooks.dismiss')}</Button>
          </CardContent>
        </Card>
      )}

      {/* Create */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={Plus} title={t('integrations.webhooks.newTitle')} hint={t('integrations.webhooks.newHint')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wh-name">{t('integrations.webhooks.name')}</Label>
              <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('integrations.webhooks.namePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">{t('integrations.webhooks.url')}</Label>
              <Input id="wh-url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/vantora" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('integrations.webhooks.events')} <span className="text-xs text-muted-foreground">({selected.length})</span></Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(grouped).map(([entity, defs]) => (
                <div key={entity} className="rounded-lg border p-3">
                  <div className="mb-2 text-sm font-medium">{entityLabel(entity)}</div>
                  <div className="space-y-1.5">
                    {defs.map((d) => (
                      <label key={d.key} className="flex cursor-pointer items-center gap-1.5 text-sm">
                        <input type="checkbox" className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                          checked={!!events[d.key]} onChange={() => toggle(d.key)} />
                        <span className="font-mono text-xs">{d.key.split('.')[1]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Button disabled={busy} onClick={create} className="w-full sm:w-auto">
            <Webhook className="h-4 w-4" /> {t('integrations.webhooks.generate')}
          </Button>
        </CardContent>
      </Card>

      {/* Subscriptions */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={Webhook} title={t('integrations.webhooks.listTitle')} />
          {hooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('integrations.webhooks.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.webhooks.name')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.webhooks.url')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.webhooks.events')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.webhooks.status')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('integrations.webhooks.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {hooks.map((h) => (
                    <tr key={h.id} className="border-t transition-colors hover:bg-secondary/30">
                      <td className="px-3 py-2">{h.name}</td>
                      <td className="px-3 py-2 max-w-[220px] truncate font-mono text-xs" dir="ltr">{h.url}</td>
                      <td className="px-3 py-2"><Badge variant="secondary">{h.events.length}</Badge></td>
                      <td className="px-3 py-2">
                        <Badge variant={h.isActive ? 'success' : 'destructive'}>
                          {h.isActive ? t('integrations.webhooks.active') : t('integrations.webhooks.disabled')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {h.isActive && (
                            <>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => test(h.id)}>
                                <Send className="h-3.5 w-3.5" /> {t('integrations.webhooks.test')}
                              </Button>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => revoke(h.id)}>
                                <Ban className="h-3.5 w-3.5 text-destructive" /> {t('integrations.webhooks.revoke')}
                              </Button>
                            </>
                          )}
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

      {/* Recent deliveries */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={ScrollText} title={t('integrations.webhooks.deliveriesTitle')} />
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('integrations.webhooks.deliveriesEmpty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.webhooks.event')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.webhooks.status')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('integrations.webhooks.attempts')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.webhooks.code')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.webhooks.when')}</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-t transition-colors hover:bg-secondary/30">
                      <td className="px-3 py-2 font-mono text-xs" dir="ltr">{d.event}</td>
                      <td className="px-3 py-2"><Badge variant={statusVariant(d.status)}>{d.status}</Badge></td>
                      <td className="px-3 py-2 text-end tabular-nums">{d.attempts}</td>
                      <td className="px-3 py-2 tabular-nums">{d.lastStatusCode ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(d.createdAt, INTL_LOCALE[locale])}</td>
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
