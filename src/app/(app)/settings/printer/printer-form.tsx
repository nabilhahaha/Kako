'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updatePrintSettings } from './actions';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Printer } from 'lucide-react';

export interface PrintSettings {
  receipt_paper: '80mm' | '58mm' | 'A4' | null;
  receipt_header: string | null;
  receipt_footer: string | null;
  show_logo: boolean | null;
  show_tax_number: boolean | null;
}

export function PrinterForm({ settings }: { settings: PrintSettings | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showLogo, setShowLogo] = useState(settings?.show_logo ?? true);
  const [showTax, setShowTax] = useState(settings?.show_tax_number ?? true);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('show_logo', String(showLogo));
    fd.set('show_tax_number', String(showTax));
    start(async () => {
      const res = await updatePrintSettings(fd);
      if (!res.ok) { toast.error(res.error ?? ''); return; }
      toast.success(t('settings.printer.saved'));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="max-w-lg space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('settings.printer.paper')}</span>
            <select name="receipt_paper" defaultValue={settings?.receipt_paper ?? '80mm'} className="h-10 rounded-md border bg-background px-3">
              <option value="80mm">{t('settings.printer.paper80')}</option>
              <option value="58mm">{t('settings.printer.paper58')}</option>
              <option value="A4">{t('settings.printer.paperA4')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('settings.printer.header')}</span>
            <Input name="receipt_header" defaultValue={settings?.receipt_header ?? ''} placeholder={t('settings.printer.headerPlaceholder')} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('settings.printer.footer')}</span>
            <Input name="receipt_footer" defaultValue={settings?.receipt_footer ?? ''} placeholder={t('settings.printer.footerPlaceholder')} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} />
            {t('settings.printer.showLogo')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showTax} onChange={(e) => setShowTax(e.target.checked)} />
            {t('settings.printer.showTaxNumber')}
          </label>
          <Button type="submit" disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {t('settings.printer.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
