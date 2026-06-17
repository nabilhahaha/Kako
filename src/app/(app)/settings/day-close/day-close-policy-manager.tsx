'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Save, Loader2, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { saveDayClosePolicy } from './actions';

export interface DayClosePolicyView {
  mode: 'direct' | 'custom';
  supervisorEnabled: boolean; reconcileEnabled: boolean; settleEnabled: boolean;
  supervisorRole: string | null; reconcileRole: string | null; settleRole: string | null;
  stageOrder: string[];
  separationOfDuties: boolean;
  cashVarianceTol: number | null;
  stockVarianceTol: number | null;
  slaHours: number | null;
  settleBlocksClose: boolean;
  reconcileBlocksClose: boolean;
  allowPartialSettlement: boolean;
  autoCarryForward: boolean;
  reconcileCadence: 'daily' | 'weekly' | 'monthly' | 'surprise' | 'not_required';
}

const CADENCES = ['daily', 'weekly', 'monthly', 'surprise', 'not_required'] as const;

// Roles a company may assign to a stage (not hardcoded to one role per stage).
const ROLE_OPTIONS = ['any', 'supervisor', 'branch_manager', 'warehouse_keeper', 'cashier', 'accountant', 'manager'];

type Preset = 'direct' | 'supervisor' | 'supervisor_settle' | 'full';

export function DayClosePolicyManager({ policy, flagOn }: { policy: DayClosePolicyView; flagOn: boolean }) {
  const { t } = useI18n();
  const dl = (k: string) => t(`dayClosePolicy.${k}`);
  const [p, setP] = useState<DayClosePolicyView>(policy);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof DayClosePolicyView>(k: K, v: DayClosePolicyView[K]) => setP((s) => ({ ...s, [k]: v }));

  function applyPreset(preset: Preset) {
    if (preset === 'direct') { setP((s) => ({ ...s, mode: 'direct', supervisorEnabled: false, reconcileEnabled: false, settleEnabled: false })); return; }
    setP((s) => ({
      ...s, mode: 'custom',
      supervisorEnabled: true,
      reconcileEnabled: preset === 'full',
      settleEnabled: preset === 'full' || preset === 'supervisor_settle',
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await saveDayClosePolicy({
        mode: p.mode,
        supervisorEnabled: p.supervisorEnabled, reconcileEnabled: p.reconcileEnabled, settleEnabled: p.settleEnabled,
        supervisorRole: p.supervisorRole, reconcileRole: p.reconcileRole, settleRole: p.settleRole,
        stageOrder: p.stageOrder,
        separationOfDuties: p.separationOfDuties,
        cashVarianceTol: p.cashVarianceTol, stockVarianceTol: p.stockVarianceTol, slaHours: p.slaHours,
        settleBlocksClose: p.settleBlocksClose, reconcileBlocksClose: p.reconcileBlocksClose,
        allowPartialSettlement: p.allowPartialSettlement, autoCarryForward: p.autoCarryForward,
        reconcileCadence: p.reconcileCadence,
      });
      if (!res.ok) { toast.error(res.error ?? dl('error')); return; }
      toast.success(dl('saved'));
    } finally { setSaving(false); }
  }

  const roleSelect = (value: string | null, onChange: (v: string) => void) => (
    <Select value={value ?? 'any'} onChange={(e) => onChange(e.target.value)}>
      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{dl(`role_${r}`)}</option>)}
    </Select>
  );

  return (
    <div className="space-y-4">
      {!flagOn && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-2 pt-5 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">{dl('flagOffTitle')}</p>
              <p className="text-muted-foreground">{dl('flagOffBody')} <a href="/settings/features" className="text-primary underline underline-offset-2">{dl('enableInFeatures')}</a></p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Presets + mode */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-sm font-semibold">{dl('modeTitle')}</h2>
          <div className="flex flex-wrap gap-2">
            {(['direct', 'supervisor', 'supervisor_settle', 'full'] as Preset[]).map((pr) => (
              <Button key={pr} type="button" size="sm" variant="outline" onClick={() => applyPreset(pr)}>{dl(`preset_${pr}`)}</Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>{dl('modeLabel')}</Label>
            <Select value={p.mode} onChange={(e) => set('mode', e.target.value as 'direct' | 'custom')}>
              <option value="direct">{dl('modeDirect')}</option>
              <option value="custom">{dl('modeCustom')}</option>
            </Select>
            <p className="text-xs text-muted-foreground">{dl(p.mode === 'direct' ? 'modeHintDirect' : 'modeHintCustom')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Stages */}
      {p.mode === 'custom' && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-sm font-semibold">{dl('stagesTitle')}</h2>
            <p className="text-xs text-muted-foreground">{dl('stagesHint')}</p>

            <StageRow label={dl('stageSupervisor')} enabled={p.supervisorEnabled} onToggle={(v) => set('supervisorEnabled', v)}
              roleNode={roleSelect(p.supervisorRole, (v) => set('supervisorRole', v))} enabledLabel={dl('enabled')} roleLabel={dl('assignedRole')} />
            <StageRow label={dl('stageReconcile')} enabled={p.reconcileEnabled} onToggle={(v) => set('reconcileEnabled', v)}
              roleNode={roleSelect(p.reconcileRole, (v) => set('reconcileRole', v))} enabledLabel={dl('enabled')} roleLabel={dl('assignedRole')} />
            <StageRow label={dl('stageSettle')} enabled={p.settleEnabled} onToggle={(v) => set('settleEnabled', v)}
              roleNode={roleSelect(p.settleRole, (v) => set('settleRole', v))} enabledLabel={dl('enabled')} roleLabel={dl('assignedRole')} />

            {/* Reconciliation cadence (when the inventory track is on). */}
            {p.reconcileEnabled && (
              <div className="space-y-1 rounded-md bg-secondary/20 p-2.5">
                <Label className="text-xs">{dl('reconcileCadence')}</Label>
                <Select value={p.reconcileCadence} onChange={(e) => set('reconcileCadence', e.target.value as DayClosePolicyView['reconcileCadence'])}>
                  {CADENCES.map((c) => <option key={c} value={c}>{dl(`cadence_${c}`)}</option>)}
                </Select>
                <p className="text-xs text-muted-foreground">{dl('cadenceHint')}</p>
              </div>
            )}

            {/* Close-gating: which tracks must finish before the day can close. */}
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-semibold">{dl('closeGating')}</p>
              {p.settleEnabled && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={p.settleBlocksClose} onChange={(e) => set('settleBlocksClose', e.target.checked)} /> {dl('settleBlocksClose')}
                </label>
              )}
              {p.reconcileEnabled && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={p.reconcileBlocksClose} onChange={(e) => set('reconcileBlocksClose', e.target.checked)} /> {dl('reconcileBlocksClose')}
                </label>
              )}
              <p className="text-xs text-muted-foreground">{dl('closeGatingHint')}</p>
            </div>

            {p.settleEnabled && (
              <>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={p.allowPartialSettlement} onChange={(e) => set('allowPartialSettlement', e.target.checked)} /> {dl('allowPartial')}
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={p.autoCarryForward} onChange={(e) => set('autoCarryForward', e.target.checked)} /> {dl('autoCarryForward')}
                </label>
                <p className="text-xs text-muted-foreground">{dl('carryForwardHint')}</p>
              </>
            )}

            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={p.separationOfDuties} onChange={(e) => set('separationOfDuties', e.target.checked)} />
              {dl('separationOfDuties')}
            </label>
            <p className="text-xs text-muted-foreground">{dl('sodHint')}</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label className="text-xs">{dl('stockTol')}</Label>
                <Input type="number" value={p.stockVarianceTol ?? ''} onChange={(e) => set('stockVarianceTol', e.target.value.trim() ? Number(e.target.value) : null)} placeholder="—" /></div>
              <div className="space-y-1"><Label className="text-xs">{dl('cashTol')}</Label>
                <Input type="number" value={p.cashVarianceTol ?? ''} onChange={(e) => set('cashVarianceTol', e.target.value.trim() ? Number(e.target.value) : null)} placeholder="—" /></div>
              <div className="space-y-1"><Label className="text-xs">{dl('slaHours')}</Label>
                <Input type="number" value={p.slaHours ?? ''} onChange={(e) => set('slaHours', e.target.value.trim() ? Number(e.target.value) : null)} placeholder="—" /></div>
            </div>
          </CardContent>
        </Card>
      )}

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {dl('save')}
      </Button>
    </div>
  );
}

function StageRow({ label, enabled, onToggle, roleNode, enabledLabel, roleLabel }: {
  label: string; enabled: boolean; onToggle: (v: boolean) => void; roleNode: ReactNode; enabledLabel: string; roleLabel: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} /> {label}
        <span className="text-xs font-normal text-muted-foreground">({enabledLabel})</span>
      </label>
      {enabled && (
        <div className="mt-2 space-y-1">
          <Label className="text-xs">{roleLabel}</Label>
          {roleNode}
        </div>
      )}
    </div>
  );
}
