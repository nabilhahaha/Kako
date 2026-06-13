'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeftRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { transferCustomer } from '../../field/actions';

type Opt = { id: string; name: string; name_ar: string | null };

export function CustomerTransferForm({ customers, branches }: { customers: Opt[]; branches: Opt[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [customerId, setCustomerId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [reason, setReason] = useState('');
  const nm = (o: Opt) => (locale === 'ar' ? o.name_ar || o.name : o.name);

  function submit() {
    if (!customerId || !toBranchId) { toast.error(t('transferReq.selectRequired')); return; }
    start(async () => {
      const res = await transferCustomer({ customerId, toBranchId, reason: reason.trim() || null, requireApproval: true });
      if (res.ok) {
        toast.success(t('transferReq.success'));
        router.push('/approvals/queue');
      } else {
        toast.error(res.error ?? t('transferReq.error'));
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><ArrowLeftRight className="h-5 w-5 text-primary" />{t('transferReq.customerTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('transferReq.customerDesc')}</p>
      </div>
      <Card><CardContent className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label>{t('transferReq.selectCustomer')}</Label>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{nm(c)}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('transferReq.targetBranch')}</Label>
          <Select value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
            <option value="">—</option>
            {branches.map((bch) => <option key={bch.id} value={bch.id}>{nm(bch)}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('transferReq.reason')}</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('transferReq.reason')} />
        </div>
        <Button className="w-full" disabled={pending} onClick={submit}>
          {pending ? t('transferReq.submitting') : t('transferReq.submit')}
        </Button>
      </CardContent></Card>
    </div>
  );
}
