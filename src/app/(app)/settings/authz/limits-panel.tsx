'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { LIMIT_ACTIONS, type RoleLimit } from '@/lib/erp/limits';
import { GRANULAR_CAPABILITY_LABELS, isDenyAllCapability } from '@/lib/erp/granular-capabilities';
import { setRoleLimit, removeRoleLimit } from './actions';
import type { AuthzMember, AuthzRole } from '@/lib/erp/authz-console-server';

/** Friendly labels for limit actions not covered by the capability catalog. */
const EXTRA_ACTION_KEY: Record<string, string> = {
  'sales.return.approve': 'authz.actSalesReturnApprove',
  'sales.order.discount': 'authz.actSalesOrderDiscount',
  'sales.invoice.discount': 'authz.actSalesInvoiceDiscount',
};

/** C. Approval Limits (P4) — numeric authority rules per subject/action. */
export function LimitsPanel({
  members,
  roles,
  limitRows,
}: {
  members: AuthzMember[];
  roles: AuthzRole[];
  limitRows: RoleLimit[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ar = locale === 'ar';

  const [subjectKind, setSubjectKind] = useState<'role' | 'user'>('role');
  const [subjectId, setSubjectId] = useState('');
  const [action, setAction] = useState<string>(LIMIT_ACTIONS[0]);
  const [maxAmount, setMaxAmount] = useState('');
  const [maxPercent, setMaxPercent] = useState('');

  const roleName = (key: string) => roles.find((r) => r.key === key)?.name_ar || key;
  const memberName = (id: string) => members.find((m) => m.id === id)?.name || id;

  function actionLabel(act: string): string {
    if (isDenyAllCapability(act)) return ar ? GRANULAR_CAPABILITY_LABELS[act].ar : GRANULAR_CAPABILITY_LABELS[act].en;
    const key = EXTRA_ACTION_KEY[act];
    return key ? t(key) : act;
  }

  function addRule() {
    if (!subjectId) { toast.error(t('authz.limitsInvalidSubject')); return; }
    const amt = maxAmount.trim() === '' ? null : Number(maxAmount);
    const pct = maxPercent.trim() === '' ? null : Number(maxPercent);
    if (amt !== null && (Number.isNaN(amt) || amt < 0)) { toast.error(t('authz.limitsInvalidRange')); return; }
    if (pct !== null && (Number.isNaN(pct) || pct < 0 || pct > 100)) { toast.error(t('authz.limitsInvalidRange')); return; }
    startTransition(async () => {
      const res = await setRoleLimit({
        userId: subjectKind === 'user' ? subjectId : null,
        roleKey: subjectKind === 'role' ? subjectId : null,
        action,
        maxAmount: amt,
        maxPercent: pct,
      });
      if (!res.ok) { toast.error(t('authz.error')); return; }
      toast.success(t('authz.saved'));
      setMaxAmount(''); setMaxPercent('');
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeRoleLimit(id);
      if (!res.ok) { toast.error(t('authz.error')); return; }
      toast.success(t('authz.saved'));
      router.refresh();
    });
  }

  const subjectOptions = subjectKind === 'role'
    ? roles.map((r) => ({ id: r.key, name: ar ? roleName(r.key) : r.key }))
    : members.map((m) => ({ id: m.id, name: m.name }));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t('authz.limitsTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('authz.limitsHint')}</p>
      </div>

      {/* Add-rule form */}
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{t('authz.limitsSubject')}</label>
            <Select className="h-9 text-sm" value={subjectKind} disabled={pending} onChange={(e) => { setSubjectKind(e.target.value as 'role' | 'user'); setSubjectId(''); }}>
              <option value="role">{t('authz.limitsSubjectRole')}</option>
              <option value="user">{t('authz.limitsSubjectUser')}</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{subjectKind === 'role' ? t('authz.role') : t('authz.user')}</label>
            <Select className="h-9 text-sm" value={subjectId} disabled={pending} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">{subjectKind === 'role' ? t('authz.selectRole') : t('authz.selectUser')}</option>
              {subjectOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{t('authz.action')}</label>
            <Select className="h-9 text-sm" value={action} disabled={pending} onChange={(e) => setAction(e.target.value)}>
              {LIMIT_ACTIONS.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{t('authz.limitsMaxAmount')}</label>
            <Input type="number" min={0} value={maxAmount} disabled={pending} onChange={(e) => setMaxAmount(e.target.value)} placeholder={t('authz.limitsMaxAmountHint')} className="h-9" dir="ltr" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{t('authz.limitsMaxPercent')}</label>
            <Input type="number" min={0} max={100} value={maxPercent} disabled={pending} onChange={(e) => setMaxPercent(e.target.value)} placeholder={t('authz.limitsMaxPercentHint')} className="h-9" dir="ltr" />
          </div>
          <div className="flex items-end">
            <Button size="sm" disabled={pending || !subjectId} onClick={addRule}>{t('authz.limitsAddRule')}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing rules */}
      <Card>
        <CardContent className="p-0">
          {limitRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t('authz.limitsNoRules')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('authz.limitsColSubject')}</th>
                    <th className="p-3 text-start font-medium">{t('authz.limitsColAction')}</th>
                    <th className="p-3 text-start font-medium">{t('authz.limitsColAmount')}</th>
                    <th className="p-3 text-start font-medium">{t('authz.limitsColPercent')}</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {limitRows.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-3">
                        {r.userId ? memberName(r.userId) : (ar ? roleName(r.roleKey ?? '') : r.roleKey)}
                        <span className="ms-1 text-[11px] text-muted-foreground">
                          ({r.userId ? t('authz.limitsSubjectUser') : t('authz.limitsSubjectRole')})
                        </span>
                      </td>
                      <td className="p-3">{actionLabel(r.action)}</td>
                      <td className="p-3" dir="ltr">{r.maxAmount === null ? t('authz.unlimited') : r.maxAmount.toLocaleString()}</td>
                      <td className="p-3" dir="ltr">{r.maxPercent === null ? t('authz.none') : `${r.maxPercent}%`}</td>
                      <td className="p-3 text-end">
                        <button type="button" disabled={pending} onClick={() => remove(r.id)} className="text-destructive hover:opacity-70" aria-label={t('authz.remove')}>
                          <Trash2 className="h-4 w-4" />
                        </button>
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
