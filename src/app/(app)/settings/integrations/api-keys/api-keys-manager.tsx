'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Plus, Copy, Check, Ban, ShieldAlert, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { INBOUND_ENTITIES, scopeFor } from '@/lib/erp/integration';
import { getEntity } from '@/lib/erp/entities';
import { createApiKey, revokeApiKey, type ApiKeyRow } from './actions';

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

export function ApiKeysManager({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const { t, locale } = useI18n();
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ prefix: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedScopes = Object.keys(scopes).filter((s) => scopes[s]);
  const toggle = (s: string) => setScopes((c) => ({ ...c, [s]: !c[s] }));

  async function create() {
    if (!name.trim()) return toast.error(t('integrations.apiKeys.nameRequired'));
    if (selectedScopes.length === 0) return toast.error(t('integrations.apiKeys.scopeRequired'));
    setBusy(true);
    try {
      const res = await createApiKey(name.trim(), selectedScopes);
      if (!res.ok || !res.data) return toast.error(res.error ?? t('integrations.apiKeys.error'));
      setCreated({ prefix: res.data.prefix, apiKey: res.data.apiKey });
      setKeys((k) => [
        { id: res.data!.id, name: name.trim(), prefix: res.data!.prefix, scopes: selectedScopes,
          isActive: true, lastUsedAt: null, createdAt: new Date().toISOString(), revokedAt: null },
        ...k,
      ]);
      setName(''); setScopes({});
    } catch {
      toast.error(t('integrations.apiKeys.error'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm(t('integrations.apiKeys.revokeConfirm'))) return;
    setBusy(true);
    try {
      const res = await revokeApiKey(id);
      if (!res.ok) return toast.error(res.error ?? t('integrations.apiKeys.error'));
      setKeys((k) => k.map((x) => (x.id === id ? { ...x, isActive: false, revokedAt: new Date().toISOString() } : x)));
      toast.success(t('integrations.apiKeys.revoked'));
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="space-y-6">
      {/* One-time reveal of a freshly-created key */}
      {created && (
        <Card className="border-accent/40">
          <CardContent className="space-y-3 p-6">
            <SectionHeader icon={ShieldAlert} title={t('integrations.apiKeys.createdTitle')} hint={t('integrations.apiKeys.createdHint')} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code dir="ltr" className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm">{created.apiKey}</code>
              <Button variant="outline" onClick={copyKey} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {copied ? t('integrations.apiKeys.copied') : t('integrations.apiKeys.copy')}
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>{t('integrations.apiKeys.dismiss')}</Button>
          </CardContent>
        </Card>
      )}

      {/* Create */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={Plus} title={t('integrations.apiKeys.newTitle')} hint={t('integrations.apiKeys.newHint')} />
          <div className="space-y-1.5">
            <Label htmlFor="key-name">{t('integrations.apiKeys.name')}</Label>
            <Input id="key-name" className="sm:max-w-sm" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('integrations.apiKeys.namePlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>{t('integrations.apiKeys.scopes')}</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {INBOUND_ENTITIES.map((entity) => (
                <div key={entity} className="rounded-lg border p-3">
                  <div className="mb-2 text-sm font-medium">{(locale === 'ar' ? getEntity(entity)?.labelAr : getEntity(entity)?.labelEn) || entity}</div>
                  <div className="flex flex-wrap gap-3">
                    {(['read', 'write'] as const).map((action) => {
                      const s = scopeFor(entity, action);
                      return (
                        <label key={s} className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input type="checkbox" className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                            checked={!!scopes[s]} onChange={() => toggle(s)} />
                          <span className="font-mono text-xs">{action}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Button disabled={busy} onClick={create} className="w-full sm:w-auto">
            <KeyRound className="h-4 w-4" /> {t('integrations.apiKeys.generate')}
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={KeyRound} title={t('integrations.apiKeys.listTitle')} />
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('integrations.apiKeys.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.apiKeys.name')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.apiKeys.prefix')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.apiKeys.scopes')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.apiKeys.lastUsed')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.apiKeys.status')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('integrations.apiKeys.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-t transition-colors hover:bg-secondary/30">
                      <td className="px-3 py-2">{k.name}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs" dir="ltr">{k.prefix}…</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => <Badge key={s} variant="secondary" className="font-mono text-[10px]">{s}</Badge>)}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {k.lastUsedAt ? formatDate(k.lastUsedAt, INTL_LOCALE[locale]) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={k.isActive ? 'success' : 'destructive'}>
                          {k.isActive ? t('integrations.apiKeys.active') : t('integrations.apiKeys.revokedStatus')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-end">
                        {k.isActive && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => revoke(k.id)}>
                            <Ban className="h-3.5 w-3.5 text-destructive" /> {t('integrations.apiKeys.revoke')}
                          </Button>
                        )}
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
