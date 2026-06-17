'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { requestCashHandover } from '@/lib/van-sales/requests-server';

/** Focused Cash-Handover request form for its dedicated screen. Same submission
 *  logic as before (erp_request_cash_handover via requestCashHandover) — only the
 *  presentation moved from the inline hub panel to a dedicated page. */
export function CashRequestForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error(t('vanSales.requests.amountRequired')); return; }
    setBusy(true);
    try {
      const res = await requestCashHandover({ amount: amt, note });
      if (!res.ok) { toast.error(res.error ?? '—'); return; }
      toast.success(t('vanSales.requests.submitted'));
      setAmount(''); setNote('');
      router.push('/field/van-sales/requests');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('vanSales.requests.amount')}</Label>
        <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <div className="space-y-1.5">
        <Label>{t('vanSales.requests.note')}</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('vanSales.requests.notePlaceholder')} />
      </div>
      <Button className="w-full" disabled={busy} onClick={submit}>
        <Send className="h-4 w-4" /> {busy ? t('vanSales.requests.submitting') : t('vanSales.requests.submit')}
      </Button>
    </div>
  );
}
