'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, Loader2, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { PolicyMode, ReturnDecision, ApprovalLevel } from '@/lib/van-sales/return-policy';
import { saveReturnPolicy, saveReturnRule, deleteReturnRule, type ReturnRuleInput } from './actions';

export interface RefItem { id: string; name: string }
export interface PolicyView { mode: PolicyMode; approverRole: ApprovalLevel | null; backupApproverRole: ApprovalLevel | null }
export interface RuleView {
  id: string; priority: number; active: boolean;
  returnType: string | null; minValue: number | null; maxValue: number | null;
  customerId: string | null; customerClass: string | null; salesmanId: string | null;
  routeId: string | null; productCategoryId: string | null;
  result: ReturnDecision; approverLevel: ApprovalLevel | null; backupApproverLevel: ApprovalLevel | null;
}
interface Ref { customers: RefItem[]; routes: RefItem[]; categories: RefItem[]; salesmen: RefItem[] }

const LEVELS: (ApprovalLevel | '')[] = ['', 'supervisor', 'branch_manager', 'company_admin'];
const LEVEL_KEY: Record<string, string> = { supervisor: 'lvlSupervisor', branch_manager: 'lvlBranchManager', company_admin: 'lvlCompanyAdmin' };

let draftSeq = -1;
function blankRule(): RuleView {
  return {
    id: String(draftSeq--), priority: 100, active: true,
    returnType: null, minValue: null, maxValue: null,
    customerId: null, customerClass: null, salesmanId: null, routeId: null, productCategoryId: null,
    result: 'approval', approverLevel: null, backupApproverLevel: null,
  };
}

export function ReturnPolicyManager({ policy, rules, ref, flagOn }: { policy: PolicyView; rules: RuleView[]; ref: Ref; flagOn: boolean }) {
  const { t } = useI18n();
  const rl = (k: string) => t(`returnPolicy.${k}`);
  const [mode, setMode] = useState<PolicyMode>(policy.mode);
  const [approver, setApprover] = useState<ApprovalLevel | ''>(policy.approverRole ?? '');
  const [backup, setBackup] = useState<ApprovalLevel | ''>(policy.backupApproverRole ?? '');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [list, setList] = useState<RuleView[]>(rules);

  async function savePolicy() {
    setSavingPolicy(true);
    try {
      const res = await saveReturnPolicy({ mode, approverRole: approver || null, backupApproverRole: backup || null });
      if (!res.ok) { toast.error(res.error ?? rl('error')); return; }
      toast.success(rl('saved'));
    } finally { setSavingPolicy(false); }
  }

  return (
    <div className="space-y-4">
      {!flagOn && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-2 pt-5 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">{rl('flagOffTitle')}</p>
              <p className="text-muted-foreground">{rl('flagOffBody')} <a href="/settings/features" className="text-primary underline underline-offset-2">{rl('enableInFeatures')}</a></p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Policy */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-sm font-semibold">{rl('policyTitle')}</h2>
          <div className="space-y-1.5">
            <Label>{rl('modeLabel')}</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as PolicyMode)}>
              <option value="disabled">{rl('modeDisabled')}</option>
              <option value="open">{rl('modeOpen')}</option>
              <option value="approval">{rl('modeApproval')}</option>
            </Select>
            <p className="text-xs text-muted-foreground">{rl(`modeHint_${mode}`)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{rl('primaryApprover')}</Label>
              <Select value={approver} onChange={(e) => setApprover(e.target.value as ApprovalLevel | '')}>
                {LEVELS.map((l) => <option key={l || 'none'} value={l}>{l ? rl(LEVEL_KEY[l]) : rl('none')}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{rl('backupApprover')}</Label>
              <Select value={backup} onChange={(e) => setBackup(e.target.value as ApprovalLevel | '')}>
                {LEVELS.map((l) => <option key={l || 'none'} value={l}>{l ? rl(LEVEL_KEY[l]) : rl('none')}</option>)}
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{rl('delegationHint')}</p>
          <Button onClick={savePolicy} disabled={savingPolicy}>
            {savingPolicy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {rl('save')}
          </Button>
        </CardContent>
      </Card>

      {/* Rules */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{rl('rulesTitle')}</h2>
            <Button size="sm" variant="outline" onClick={() => setList((l) => [...l, blankRule()])}>
              <Plus className="h-4 w-4" /> {rl('addRule')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{rl('rulesHint')}</p>
          {list.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">{rl('noRules')}</p>
          ) : (
            <div className="space-y-3">
              {[...list].sort((a, b) => a.priority - b.priority).map((r) => (
                <RuleEditor key={r.id} rule={r} ref={ref}
                  onSaved={(saved) => setList((l) => l.map((x) => (x.id === r.id ? saved : x)))}
                  onDeleted={() => setList((l) => l.filter((x) => x.id !== r.id))} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleEditor({ rule, ref, onSaved, onDeleted }: { rule: RuleView; ref: Ref; onSaved: (r: RuleView) => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const rl = (k: string) => t(`returnPolicy.${k}`);
  const [r, setR] = useState<RuleView>(rule);
  const [busy, setBusy] = useState(false);
  const isDraft = Number(rule.id) < 0;
  const set = <K extends keyof RuleView>(k: K, v: RuleView[K]) => setR((p) => ({ ...p, [k]: v }));
  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

  async function save() {
    setBusy(true);
    try {
      const input: ReturnRuleInput = {
        id: isDraft ? undefined : r.id,
        priority: r.priority, active: r.active, returnType: r.returnType, minValue: r.minValue, maxValue: r.maxValue,
        customerId: r.customerId, customerClass: r.customerClass, salesmanId: r.salesmanId, routeId: r.routeId,
        productCategoryId: r.productCategoryId, result: r.result, approverLevel: r.approverLevel, backupApproverLevel: r.backupApproverLevel,
      };
      const res = await saveReturnRule(input);
      if (!res.ok || !res.data) { toast.error(res.error ?? rl('error')); return; }
      onSaved({ ...r, id: res.data.id });
      toast.success(rl('ruleSaved'));
    } finally { setBusy(false); }
  }

  async function remove() {
    if (isDraft) { onDeleted(); return; }
    setBusy(true);
    try {
      const res = await deleteReturnRule(r.id);
      if (!res.ok) { toast.error(res.error ?? rl('error')); return; }
      onDeleted();
      toast.success(rl('ruleDeleted'));
    } finally { setBusy(false); }
  }

  const resultTone = r.result === 'block' ? 'destructive' : r.result === 'approval' ? 'warning' : 'success';

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">#{r.priority}</Badge>
          <Badge variant={resultTone}>{rl(`r_${r.result}`)}</Badge>
          {!r.active && <Badge variant="outline">{rl('inactive')}</Badge>}
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={r.active} onChange={(e) => set('active', e.target.checked)} /> {rl('active')}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label={rl('priority')}>
          <Input type="number" value={r.priority} onChange={(e) => set('priority', Math.trunc(Number(e.target.value) || 0))} />
        </Field>
        <Field label={rl('returnType')}>
          <Select value={r.returnType ?? ''} onChange={(e) => set('returnType', e.target.value || null)}>
            <option value="">{rl('any')}</option>
            <option value="saleable">{rl('saleable')}</option>
            <option value="damage">{rl('damage')}</option>
          </Select>
        </Field>
        <Field label={rl('result')}>
          <Select value={r.result} onChange={(e) => set('result', e.target.value as ReturnDecision)}>
            <option value="auto">{rl('r_auto')}</option>
            <option value="approval">{rl('r_approval')}</option>
            <option value="block">{rl('r_block')}</option>
          </Select>
        </Field>
        <Field label={rl('minValue')}>
          <Input type="number" value={r.minValue ?? ''} onChange={(e) => set('minValue', num(e.target.value))} placeholder={rl('any')} />
        </Field>
        <Field label={rl('maxValue')}>
          <Input type="number" value={r.maxValue ?? ''} onChange={(e) => set('maxValue', num(e.target.value))} placeholder={rl('any')} />
        </Field>
        <Field label={rl('approverLevel')}>
          <Select value={r.approverLevel ?? ''} onChange={(e) => set('approverLevel', (e.target.value || null) as ApprovalLevel | null)}>
            {LEVELS.map((l) => <option key={l || 'none'} value={l}>{l ? rl(LEVEL_KEY[l]) : rl('defaultLevel')}</option>)}
          </Select>
        </Field>
        <Field label={rl('backupLevel')}>
          <Select value={r.backupApproverLevel ?? ''} onChange={(e) => set('backupApproverLevel', (e.target.value || null) as ApprovalLevel | null)}>
            {LEVELS.map((l) => <option key={l || 'none'} value={l}>{l ? rl(LEVEL_KEY[l]) : rl('defaultLevel')}</option>)}
          </Select>
        </Field>
        <Field label={rl('customer')}>
          <RefSelect value={r.customerId} items={ref.customers} anyLabel={rl('any')} onChange={(v) => set('customerId', v)} />
        </Field>
        <Field label={rl('salesman')}>
          <RefSelect value={r.salesmanId} items={ref.salesmen} anyLabel={rl('any')} onChange={(v) => set('salesmanId', v)} />
        </Field>
        <Field label={rl('route')}>
          <RefSelect value={r.routeId} items={ref.routes} anyLabel={rl('any')} onChange={(v) => set('routeId', v)} />
        </Field>
        <Field label={rl('category')}>
          <RefSelect value={r.productCategoryId} items={ref.categories} anyLabel={rl('any')} onChange={(v) => set('productCategoryId', v)} />
        </Field>
        <Field label={rl('customerClass')}>
          <Input value={r.customerClass ?? ''} onChange={(e) => set('customerClass', e.target.value || null)} placeholder={rl('any')} />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="text-destructive" onClick={remove} disabled={busy}>
          <Trash2 className="h-4 w-4" /> {rl('delete')}
        </Button>
        <Button size="sm" className="flex-1" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {rl('saveRule')}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function RefSelect({ value, items, anyLabel, onChange }: { value: string | null; items: RefItem[]; anyLabel: string; onChange: (v: string | null) => void }) {
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{anyLabel}</option>
      {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
    </Select>
  );
}
