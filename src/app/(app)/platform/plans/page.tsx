import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { ALL_MODULES, type Module } from '@/lib/erp/navigation';
import { PlansManager, type PlanRow, type CompanyModuleState } from './plans-manager';

export const dynamic = 'force-dynamic';

/** Platform → Plans & Modules. Vendor catalog: subscription plans, their module
 *  entitlements, and business-type templates. Owner-only (catalog data). */
export default async function PlatformPlansPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isPlatformOwner) {
    return (
      <div>
        <PageHeader title={t('platform.plans.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('platform.ownerOnly')}</CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: plansRaw }, { data: planModsRaw }, { data: companiesRaw }, { data: companyModsRaw }, { data: btmRaw }] =
    await Promise.all([
      supabase.from('erp_plans').select('*').order('rank'),
      supabase.from('erp_plan_modules').select('plan_key, module'),
      supabase.from('erp_companies').select('id, name, name_ar, plan_key, business_type'),
      supabase.from('erp_company_modules').select('company_id, module, enabled'),
      supabase.from('erp_business_type_modules').select('business_type, module'),
    ]);

  const planModules = new Map<string, string[]>();
  for (const r of (planModsRaw ?? []) as { plan_key: string; module: string }[]) {
    const arr = planModules.get(r.plan_key) ?? [];
    arr.push(r.module);
    planModules.set(r.plan_key, arr);
  }

  // Enabled modules per company (for the impact preview).
  const enabledByCompany = new Map<string, Module[]>();
  for (const r of (companyModsRaw ?? []) as { company_id: string; module: string; enabled: boolean }[]) {
    if (!r.enabled) continue;
    const arr = enabledByCompany.get(r.company_id) ?? [];
    if ((ALL_MODULES as string[]).includes(r.module)) arr.push(r.module as Module);
    enabledByCompany.set(r.company_id, arr);
  }

  const companies = (companiesRaw ?? []) as { id: string; name: string; name_ar: string | null; plan_key: string | null; business_type: string | null }[];
  const companiesByPlan = new Map<string, CompanyModuleState[]>();
  for (const c of companies) {
    const key = c.plan_key ?? '(none)';
    const arr = companiesByPlan.get(key) ?? [];
    arr.push({ id: c.id, name: c.name_ar || c.name, enabledModules: enabledByCompany.get(c.id) ?? [] });
    companiesByPlan.set(key, arr);
  }

  const plans: PlanRow[] = ((plansRaw ?? []) as Record<string, unknown>[]).map((p) => ({
    key: p.key as string,
    nameEn: (p.name_en as string) ?? '',
    nameAr: (p.name_ar as string) ?? '',
    rank: (p.rank as number) ?? 0,
    maxUsers: (p.max_users as number) ?? null,
    maxBranches: (p.max_branches as number) ?? null,
    maxProducts: (p.max_products as number) ?? null,
    storageLimitMb: (p.storage_limit_mb as number) ?? null,
    trialDays: (p.trial_days as number) ?? 0,
    isActive: (p.is_active as boolean) ?? true,
    modules: planModules.get(p.key as string) ?? [],
    companies: companiesByPlan.get(p.key as string) ?? [],
  }));

  // Business-type templates (grouped).
  const btm = new Map<string, string[]>();
  for (const r of (btmRaw ?? []) as { business_type: string; module: string }[]) {
    const arr = btm.get(r.business_type) ?? [];
    arr.push(r.module);
    btm.set(r.business_type, arr);
  }
  const businessTypes = [...btm.entries()]
    .map(([businessType, modules]) => ({ businessType, modules }))
    .sort((a, b) => a.businessType.localeCompare(b.businessType));

  return (
    <div className="space-y-6">
      <PageHeader title={t('platform.plans.title')} description={t('platform.plans.description')} />
      <PlansManager plans={plans} businessTypes={businessTypes} />
    </div>
  );
}
