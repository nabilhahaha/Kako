'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Send } from 'lucide-react';
import { ALL_MODULES, MODULE_LABELS } from '@/lib/erp/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { requestModuleActivation } from './actions';

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export function ModuleRequestForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await requestModuleActivation(fd);
      if (!res.ok) {
        toast.error(res.error ?? t('moduleRequest.toast.error'));
        return;
      }
      toast.success(t('moduleRequest.toast.sent'));
      router.push('/requests?tab=mine');
    });
  }

  return (
    <Card className="max-w-lg">
      <CardContent className="pt-6">
        <p className="mb-4 text-sm text-muted-foreground">{t('moduleRequest.hint')}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t('moduleRequest.moduleLabel')}</Label>
            <select name="module_key" className={selectCls} defaultValue="">
              <option value="" disabled>{t('moduleRequest.modulePlaceholder')}</option>
              {ALL_MODULES.map((m) => <option key={m} value={m}>{MODULE_LABELS[m][locale]}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t('moduleRequest.noteLabel')}</Label>
            <Input name="note" placeholder={t('moduleRequest.notePlaceholder')} />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t('moduleRequest.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
