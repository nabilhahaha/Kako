'use client';

import { useEffect, useState } from 'react';
import { Printer, Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { loadPrintSettings, savePrintSettings, DEFAULT_PRINT_SETTINGS, type PosPrintSettings } from './print-settings';

/**
 * POS receipt print settings (manager/admin). Per-till (localStorage, company-scoped) because
 * printer + paper are physical to each station. Changes apply to the terminal immediately (it
 * re-reads on focus/storage). No DB write, no cross-company data.
 */
export function PrintSettingsCard({ companyId }: { companyId: string }) {
  const { t } = useI18n();
  const [s, setS] = useState<PosPrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => { setS(loadPrintSettings(companyId)); }, [companyId]);

  function update(patch: Partial<PosPrintSettings>) {
    const next = { ...s, ...patch };
    setS(next);
    savePrintSettings(companyId, next);
    setSavedAt(Date.now());
  }

  return (
    <div className="rounded-2xl border border-[#e7d6c2] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Printer className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-bold">{t('foodPosPrint.title')}</h2>
            <p className="text-[11px] text-muted-foreground">{t('foodPosPrint.subtitle')}</p>
          </div>
        </div>
        {savedAt > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><Check className="h-3.5 w-3.5" /> {t('foodPosPrint.saved')}</span>}
      </div>

      <div className="space-y-1">
        <Toggle label={t('foodPosPrint.autoPrint')} on={s.autoPrint} onClick={() => update({ autoPrint: !s.autoPrint })} />

        {/* Paper width segmented control */}
        <div className="flex items-center justify-between py-2">
          <span className="text-sm">{t('foodPosPrint.paperWidth')}</span>
          <div className="flex overflow-hidden rounded-lg border border-[#e7d6c2]">
            {(['80', '58'] as const).map((w) => (
              <button key={w} onClick={() => update({ paperWidth: w })}
                className={cn('px-3 py-1 text-sm font-semibold', s.paperWidth === w ? 'bg-primary text-primary-foreground' : 'bg-white text-muted-foreground')}>
                {w}mm
              </button>
            ))}
          </div>
        </div>

        <Toggle label={t('foodPosPrint.showLogo')} on={s.showLogo} onClick={() => update({ showLogo: !s.showLogo })} />
        <Toggle label={t('foodPosPrint.showQr')} on={s.showQr} onClick={() => update({ showQr: !s.showQr })} />
        <Toggle label={t('foodPosPrint.showCashier')} on={s.showCashier} onClick={() => update({ showCashier: !s.showCashier })} />
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">{t('foodPosPrint.note')}</p>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between py-2 text-start">
      <span className="text-sm">{label}</span>
      <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-primary' : 'bg-gray-300')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', on ? 'start-[1.375rem]' : 'start-0.5')} />
      </span>
    </button>
  );
}
