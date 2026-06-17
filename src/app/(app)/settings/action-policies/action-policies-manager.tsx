'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import type { Locale } from '@/lib/i18n/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Save } from 'lucide-react';
import { saveActionPolicy, resetActionPolicy } from './actions';

export interface PolicyView {
  actionKey: string;
  domain: string;
  labelKey: string;
  status: 'wired' | 'ready' | 'planned';
  enabled: boolean;
  risk: string;
  reasonRequired: boolean;
  approvalRequired: boolean;
  notifyTargets: string[];
  escalationTargets: string[];
  reversalAllowed: boolean;
  reversalPolicy: string;
  effectiveFrom: string | null;
  source: 'policy' | 'catalog';
}

const RISKS = ['low', 'medium', 'high', 'critical'] as const;
const REVERSALS = ['reversible', 'reverse_entry', 'approval_to_reverse', 'irreversible'] as const;
const TARGETS = [
  'customer', 'salesman', 'supervisor', 'branch_manager', 'sales_manager',
  'finance', 'inventory_controller', 'company_admin', 'approver_queue',
] as const;
const inputCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export function ActionPoliciesManager({ policies, locale }: { policies: PolicyView[]; locale: Locale }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Record<string, PolicyView>>(
    () => Object.fromEntries(policies.map((p) => [p.actionKey, p])),
  );
  const order = policies.map((p) => p.actionKey);

  const patch = (key: string, p: Partial<PolicyView>) =>
    setRows((s) => ({ ...s, [key]: { ...s[key], ...p } }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('actionPolicies.hint')}</p>
      {order.map((key) => (
        <PolicyCard key={key} row={rows[key]} patch={(p) => patch(key, p)} t={t} locale={locale} />
      ))}
    </div>
  );
}

function PolicyCard({
  row, patch, t, locale,
}: {
  row: PolicyView;
  patch: (p: Partial<PolicyView>) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
  locale: Locale;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await saveActionPolicy({
        actionKey: row.actionKey,
        enabled: row.enabled,
        risk: row.risk,
        reasonRequired: row.reasonRequired,
        approvalRequired: row.approvalRequired,
        notifyTargets: row.notifyTargets,
        escalationTargets: row.escalationTargets,
        reversalAllowed: row.reversalAllowed,
        reversalPolicy: row.reversalPolicy,
        effectiveFrom: row.effectiveFrom,
      });
      if (!res.ok) { toast.error(res.error ?? t('actionPolicies.saveError')); return; }
      toast.success(t('actionPolicies.saved'));
      router.refresh();
    });
  }

  function reset() {
    start(async () => {
      const res = await resetActionPolicy(row.actionKey);
      if (!res.ok) { toast.error(res.error ?? t('actionPolicies.saveError')); return; }
      toast.success(t('actionPolicies.resetDone'));
      router.refresh();
    });
  }

  const toggleTarget = (field: 'notifyTargets' | 'escalationTargets', val: string) => {
    const cur = row[field];
    patch({ [field]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] } as Partial<PolicyView>);
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t(row.labelKey)}</h3>
            <span className="font-mono text-xs text-muted-foreground">{row.actionKey}</span>
            <Badge variant={row.source === 'policy' ? 'default' : 'secondary'}>
              {row.source === 'policy' ? t('actionPolicies.srcOverride') : t('actionPolicies.srcDefault')}
            </Badge>
            <Badge variant="outline">{t(`actionPolicies.status.${row.status}`)}</Badge>
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={row.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
            {t('actionPolicies.enabled')}
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t('actionPolicies.risk')}</span>
            <select className={`${inputCls} w-full`} value={row.risk} onChange={(e) => patch({ risk: e.target.value })}>
              {RISKS.map((r) => <option key={r} value={r}>{t(`actionPolicies.riskLevel.${r}`)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t('actionPolicies.reversalPolicy')}</span>
            <select className={`${inputCls} w-full`} value={row.reversalPolicy} onChange={(e) => patch({ reversalPolicy: e.target.value })}>
              {REVERSALS.map((r) => <option key={r} value={r}>{t(`actionPolicies.reversal.${r}`)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t('actionPolicies.effectiveFrom')}</span>
            <Input
              type="date" className="h-9"
              value={row.effectiveFrom ? row.effectiveFrom.slice(0, 10) : ''}
              onChange={(e) => patch({ effectiveFrom: e.target.value || null })}
            />
          </label>
          <div className="flex flex-col justify-end gap-1.5 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={row.reasonRequired} onChange={(e) => patch({ reasonRequired: e.target.checked })} />
              {t('actionPolicies.reasonRequired')}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={row.approvalRequired} onChange={(e) => patch({ approvalRequired: e.target.checked })} />
              {t('actionPolicies.approvalRequired')}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={row.reversalAllowed} onChange={(e) => patch({ reversalAllowed: e.target.checked })} />
              {t('actionPolicies.reversalAllowed')}
            </label>
          </div>
        </div>

        <TargetGroup label={t('actionPolicies.notifyTargets')} selected={row.notifyTargets}
          onToggle={(v) => toggleTarget('notifyTargets', v)} t={t} />
        <TargetGroup label={t('actionPolicies.escalationTargets')} selected={row.escalationTargets}
          onToggle={(v) => toggleTarget('escalationTargets', v)} t={t} />

        <div className="flex gap-2 pt-1">
          <Button size="sm" disabled={pending} onClick={save}><Save className="h-3.5 w-3.5" /> {t('actionPolicies.save')}</Button>
          <Button size="sm" variant="outline" disabled={pending || row.source === 'catalog'} onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> {t('actionPolicies.reset')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TargetGroup({
  label, selected, onToggle, t,
}: {
  label: string; selected: string[]; onToggle: (v: string) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {TARGETS.map((tg) => {
          const on = selected.includes(tg);
          return (
            <button
              key={tg} type="button" onClick={() => onToggle(tg)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-secondary'}`}
            >
              {t(`actionPolicies.target.${tg}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
