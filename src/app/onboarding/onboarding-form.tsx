'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Rocket } from 'lucide-react';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPES } from '@/lib/erp/subscription';
import { useI18n } from '@/lib/i18n/provider';

const TRIAL_DAYS = 14;
const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function OnboardingForm() {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const company_name = String(fd.get('company_name') || '').trim();
    const company_name_ar = String(fd.get('company_name_ar') || '').trim();
    const business_type = String(fd.get('business_type') || 'general');

    if (!company_name && !company_name_ar) {
      toast.error(t('auth.errCompanyRequired'));
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('erp_self_register_company', {
      p_company_name: company_name || company_name_ar,
      p_company_name_ar: company_name_ar || null,
      p_business_type: business_type,
      p_trial_days: TRIAL_DAYS,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || t('auth.errCompany'));
      return;
    }
    toast.success(t('auth.regSuccess'));
    window.location.href = '/dashboard';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 pt-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Rocket className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">{t('auth.onbTitle')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('auth.onbSubtitle', { days: TRIAL_DAYS })}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name_ar">{t('auth.companyNameAr')}</Label>
              <Input id="company_name_ar" name="company_name_ar" placeholder={t('auth.companyNameArPh')} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">{t('auth.companyNameEn')}</Label>
              <Input id="company_name" name="company_name" dir="ltr" placeholder={t('auth.companyNameEnPh')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business_type">{t('auth.businessType')}</Label>
              <select id="business_type" name="business_type" className={selectCls} defaultValue="general">
                {BUSINESS_TYPES.map((bt) => (
                  <option key={bt} value={bt}>
                    {BUSINESS_TYPE_LABELS[bt][locale]}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {t('auth.onbSubmit')}
            </Button>
          </form>

          <form action="/auth/signout" method="post" className="text-center">
            <button type="submit" className="text-sm text-muted-foreground hover:underline">
              {t('auth.onbSignOut')}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
