'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, ShieldCheck, GripVertical, Save, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import type { MatrixTier } from '@/lib/onboarding/approval-matrix';
import {
  saveApprovalMatrix, deactivateApprovalScenario,
  type ScenarioState, type RoleOption,
} from '@/lib/onboarding/approval-matrix-server';

export function ApprovalMatrixManager({
  scenarios,
  roles,
}: {
  scenarios: ScenarioState[];
  roles: RoleOption[];
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('approvalMatrix.cumulativeNote')}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {scenarios.map((s) => (
          <ScenarioCard key={s.key} scenario={s} roles={roles} />
        ))}
      </div>
    </div>
  );
}

function ScenarioCard({ scenario, roles }: { scenario: ScenarioState; roles: RoleOption[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const [pending, startTransition] = useTransition();
  const [tiers, setTiers] = useState<MatrixTier[]>(
    scenario.tiers.length
      ? scenario.tiers
      : [{ approverType: 'role', approverRef: roles[0]?.key ?? '', aboveAmount: 0 }],
  );

  const roleName = (key: string) => roles.find((r) => r.key === key)?.nameAr ?? key;
  const titleEn = scenario.key
    .replace(/_approval(_v\d)?$/, '').replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  function update(i: number, patch: Partial<MatrixTier>) {
    setTiers((prev) => prev.map((tt, idx) => (idx === i ? { ...tt, ...patch } : tt)));
  }
  function addTier() {
    setTiers((prev) => [...prev, { approverType: 'role', approverRef: roles[0]?.key ?? '', aboveAmount: 0 }]);
  }
  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    startTransition(async () => {
      const res = await saveApprovalMatrix({ scenarioKey: scenario.key, tiers });
      if (!res.ok) { toast.error(t(`approvalMatrix.err.${res.error ?? 'generic'}`)); return; }
      toast.success(t('approvalMatrix.toast.saved'));
      router.refresh();
    });
  }
  function turnOff() {
    startTransition(async () => {
      const res = await deactivateApprovalScenario({ scenarioKey: scenario.key });
      if (!res.ok) { toast.error(t(`approvalMatrix.err.${res.error ?? 'generic'}`)); return; }
      toast.success(t('approvalMatrix.toast.off'));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold leading-tight">{t(`approvalMatrix.scenario.${scenario.key}`) || titleEn}</h3>
              <p className="text-xs text-muted-foreground">
                {scenario.amountTiered ? t('approvalMatrix.byAmount') : t('approvalMatrix.everyTime')}
              </p>
            </div>
          </div>
          {scenario.active && <Badge variant="success" className="shrink-0">{t('approvalMatrix.on')}</Badge>}
        </div>

        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border bg-card p-2">
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label className="sr-only">{t('approvalMatrix.approver')}</Label>
                  <Select
                    value={tier.approverType === 'company_admin' ? '__admin__' : tier.approverRef ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__admin__') update(i, { approverType: 'company_admin', approverRef: null });
                      else update(i, { approverType: 'role', approverRef: v });
                    }}
                    disabled={pending}
                  >
                    <option value="__admin__">{t('approvalMatrix.companyAdmin')}</option>
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>{ar ? r.nameAr : roleName(r.key)}</option>
                    ))}
                  </Select>
                </div>
                {scenario.amountTiered && (
                  <div className="flex items-center gap-1.5">
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{t('approvalMatrix.whenAbove')}</span>
                    <Input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={Number.isFinite(tier.aboveAmount) ? tier.aboveAmount : 0}
                      onChange={(e) => update(i, { aboveAmount: parseInt(e.target.value, 10) || 0 })}
                      disabled={pending}
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeTier(i)}
                disabled={pending || tiers.length === 1}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                aria-label={t('approvalMatrix.removeApprover')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addTier} disabled={pending} className="w-full">
          <Plus className="h-4 w-4" /> {t('approvalMatrix.addApprover')}
        </Button>

        <div className="flex gap-2 border-t pt-3">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('approvalMatrix.save')}
          </Button>
          {scenario.active && (
            <Button size="sm" variant="ghost" onClick={turnOff} disabled={pending}>
              <Power className="h-4 w-4" /> {t('approvalMatrix.turnOff')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
