import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { FEATURES } from '@/lib/erp/feature-catalog';
import { FeaturesWorkbench, type FeatureView } from './features-workbench';

export const dynamic = 'force-dynamic';

/**
 * Pharmacy / tenant Feature Configuration — Company-Admin only. Enable/disable
 * capabilities (inventory, POS, governance) and apply a starting template
 * (Lite / Standard / Enterprise). Flags gate nav, UI, validation and logic.
 */
export default async function FeaturesPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);

  const features: FeatureView[] = FEATURES.map((f) => ({
    key: f.key, domain: f.domain, labelKey: f.labelKey, descKey: f.descKey,
    templates: f.templates, enabled: flags[f.key] ?? false,
  }));

  return (
    <div>
      <PageHeader title={t('features.title')} description={t('features.description')} />
      <FeaturesWorkbench features={features} />
    </div>
  );
}
