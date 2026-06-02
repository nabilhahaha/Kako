'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search } from 'lucide-react';
import { setCustomerTier } from '../actions';
import { useI18n } from '@/lib/i18n/provider';

export interface TierOpt { id: string; name: string }
export interface CustomerRow { id: string; code: string; name: string; tier_id: string | null }

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export function CustomerTiers({ rows, tiers }: { rows: CustomerRow[]; tiers: TierOpt[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [, startTransition] = useTransition();
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return s ? rows.filter((r) => r.name.toLowerCase().includes(s) || r.code.toLowerCase().includes(s)) : rows; }, [rows, q]);

  function assign(customerId: string, tierId: string) {
    startTransition(async () => {
      const res = await setCustomerTier(customerId, tierId || null);
      if (!res.ok) { toast.error(res.error ?? t('wholesale.errorGeneric')); return; }
      toast.success(t('wholesale.toastTierAssigned')); router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('wholesale.placeholderSearchCustomer')} className="w-64 ps-9" />
      </div>
      <Card><CardContent className="p-0">
        {tiers.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('wholesale.noTiersYet')}</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr><th className="p-3 text-start font-medium">{t('wholesale.colCustomer')}</th><th className="p-3 text-start font-medium">{t('wholesale.colCode')}</th><th className="p-3 text-start font-medium">{t('wholesale.colLevel')}</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 text-muted-foreground" dir="ltr">{r.code}</td>
                  <td className="p-3">
                    <select value={r.tier_id ?? ''} onChange={(e) => assign(r.id, e.target.value)} className={selectCls}>
                      <option value="">{t('wholesale.optRetailDefault')}</option>
                      {tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{t('wholesale.emptyCustomers')}</td></tr>}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}
