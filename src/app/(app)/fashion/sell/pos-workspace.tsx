'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Locale } from '@/lib/i18n/config';
import { Pos } from './pos';
import { InstallmentCollect } from './installment-collect';
import { ShoppingCart, Undo2, Repeat, Wallet } from 'lucide-react';

interface Item { product_id: string; code: string; name: string; barcode: string; cash_price: number; installment_price: number }
interface Customer { id: string; name: string; phone: string | null }

type Mode = 'sale' | 'return' | 'exchange' | 'collect';

/**
 * Unified POS workspace: a mode selector over the existing (verified) New Sale
 * terminal + an in-POS installment-collection panel. Return/Exchange route to the
 * invoice-linked Returns flow (kept as the standalone admin/history page) so the
 * reversal logic is not duplicated.
 */
export function PosWorkspace({ items, customers, locale }: { items: Item[]; customers: Customer[]; locale: Locale }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('sale');

  const tabs: { key: Mode; label: string; icon: typeof ShoppingCart }[] = [
    { key: 'sale', label: t('fashion.sell.modeSale'), icon: ShoppingCart },
    { key: 'return', label: t('fashion.sell.modeReturn'), icon: Undo2 },
    { key: 'exchange', label: t('fashion.sell.modeExchange'), icon: Repeat },
    { key: 'collect', label: t('fashion.sell.modeCollect'), icon: Wallet },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <Button key={key} variant={mode === key ? 'default' : 'outline'} size="sm" onClick={() => setMode(key)} className="gap-1.5">
            <Icon className="h-4 w-4" /> {label}
          </Button>
        ))}
      </div>

      {mode === 'sale' && <Pos items={items} customers={customers} locale={locale} />}

      {(mode === 'return' || mode === 'exchange') && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {mode === 'return' ? t('fashion.sell.returnHint') : t('fashion.sell.exchangeHint')}
            </p>
            <Link href="/sales/returns" className={buttonVariants({ variant: 'default' })}>
              {mode === 'return' ? t('fashion.sell.openReturns') : t('fashion.sell.openExchange')}
            </Link>
          </CardContent>
        </Card>
      )}

      {mode === 'collect' && <InstallmentCollect customers={customers} locale={locale} />}
    </div>
  );
}
