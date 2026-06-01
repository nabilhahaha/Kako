'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Send } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { requestOnboarding } from './actions';

export interface PlanOpt { key: string; name_ar: string | null; name_en: string | null }

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export function OnboardingForm({ plans }: { plans: PlanOpt[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await requestOnboarding(fd);
      if (!res.ok) {
        toast.error(res.error ?? t('onboardingRequest.toast.error'));
        return;
      }
      toast.success(t('onboardingRequest.toast.sent'));
      router.push('/requests?tab=mine');
    });
  }

  return (
    <Card className="max-w-lg">
      <CardContent className="pt-6">
        <p className="mb-4 text-sm text-muted-foreground">{t('onboardingRequest.hint')}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t('onboardingRequest.planLabel')}</Label>
            <select name="plan_key" className={selectCls} defaultValue="">
              <option value="" disabled>{t('onboardingRequest.planPlaceholder')}</option>
              {plans.map((p) => <option key={p.key} value={p.key}>{(locale === 'ar' ? p.name_ar : p.name_en) || p.key}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t('onboardingRequest.trialDaysLabel')}</Label>
            <Input name="trial_days" type="number" min={0} dir="ltr" defaultValue={14} />
          </div>
          <div className="space-y-1">
            <Label>{t('onboardingRequest.noteLabel')}</Label>
            <Input name="note" placeholder={t('onboardingRequest.notePlaceholder')} />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t('onboardingRequest.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
