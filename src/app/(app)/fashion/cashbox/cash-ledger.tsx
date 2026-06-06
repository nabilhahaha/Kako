'use client';

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';
import { CASH_OUTFLOWS, type CashMovementKind } from '@/lib/fashion/cashbox';

export interface LedgerMovement {
  kind: CashMovementKind;
  amount: number;
  note: string | null;
  created_at: string;
  reference_type: string | null;
}

/** Signed cash effect of a movement: outflows negative, adjustments as-entered. */
function signed(m: LedgerMovement): number {
  const amt = Number(m.amount) || 0;
  if (m.kind === 'adjustment') return amt;
  return (CASH_OUTFLOWS as string[]).includes(m.kind) ? -amt : amt;
}

/** Running cash ledger for the current session: opening balance → each movement
 *  (sale / expense / owner withdrawal / owner deposit / adjustment …) with a
 *  running balance → expected closing balance. */
export function CashLedger({
  openingFloat,
  expected,
  movements,
  locale,
}: {
  openingFloat: number;
  expected: number;
  movements: LedgerMovement[];
  locale: Locale;
}) {
  const { t } = useI18n();
  const intl = INTL_LOCALE[locale];
  const money = (n: number) => formatCurrency(n, 'EGP', intl);
  const kindLabel = (k: CashMovementKind) => t(`fashion.cashbox.kind_${k}` as 'fashion.cashbox.kind_sale');

  let running = Number(openingFloat) || 0;

  return (
    <Card>
      <CardContent className="p-0">
        <h2 className="border-b p-3 text-sm font-semibold">{t('fashion.cashbox.ledger')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-2 text-start font-medium">{t('fashion.cashbox.time')}</th>
                <th className="p-2 text-start font-medium">{t('fashion.cashbox.movement')}</th>
                <th className="p-2 text-start font-medium">{t('fashion.cashbox.note')}</th>
                <th className="p-2 text-end font-medium">{t('fashion.cashbox.amount')}</th>
                <th className="p-2 text-end font-medium">{t('fashion.cashbox.balance')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b bg-secondary/20">
                <td className="p-2 text-muted-foreground" colSpan={3}>{t('fashion.cashbox.openingBalance')}</td>
                <td className="p-2"></td>
                <td className="p-2 text-end font-medium tabular-nums" dir="ltr">{money(running)}</td>
              </tr>
              {movements.map((m, i) => {
                const s = signed(m);
                running += s;
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2 text-xs text-muted-foreground" dir="ltr">{formatDateTime(m.created_at, intl)}</td>
                    <td className="p-2">{kindLabel(m.kind)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{m.note || '—'}</td>
                    <td className={`p-2 text-end tabular-nums ${s < 0 ? 'text-destructive' : 'text-success'}`} dir="ltr">
                      {s < 0 ? '-' : '+'}{money(Math.abs(s))}
                    </td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">{money(running)}</td>
                  </tr>
                );
              })}
              <tr className="border-t bg-secondary/30 font-semibold">
                <td className="p-2" colSpan={3}>{t('fashion.cashbox.expected')}</td>
                <td className="p-2"></td>
                <td className="p-2 text-end tabular-nums" dir="ltr">{money(expected)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
