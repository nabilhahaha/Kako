import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Boxes } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import { useSalesmanDay } from '@/stores/salesmanDayStore';
import { availableInUoM, getUoM, UOM_LABELS } from '@/lib/salesman/uom';

export function VanStockPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const products = useSalesmanDay((s) => s.products);
  const vanInventory = useSalesmanDay((s) => s.vanInventory);

  const rows = useMemo(() => Object.values(products).filter((p) => p.isActive), [products]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{t('salesman.vanStock')}</h1>
      <ul className="space-y-2">
        {rows.map((p) => {
          const qtyBase = vanInventory[p.id]?.qtyBase ?? 0;
          const caseUoM = getUoM(p, 'CASE');
          const cases = caseUoM ? availableInUoM(p, 'CASE', qtyBase) : 0;
          const loose = caseUoM ? qtyBase % caseUoM.factor : qtyBase;
          const name = isAr ? p.nameAr : p.name;
          return (
            <Card key={p.id} className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Boxes className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" title={name}>{name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{p.code}</p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-bold tabular-nums">
                  {formatNumber(cases)} {isAr ? UOM_LABELS.CASE.ar : UOM_LABELS.CASE.en}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  +{formatNumber(loose)} {isAr ? UOM_LABELS.PIECE.ar : UOM_LABELS.PIECE.en}
                </p>
              </div>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}
