import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { ModulePage } from '@/components/admin/module-page';
import { Card, CardContent } from '@/components/ui/card';
import { ENTITLEMENTS_ENABLED } from '@/lib/entitlements';
import { loadCompanies } from '@/lib/entitlements/matrix-server';

export const dynamic = 'force-dynamic';

// Platform Owner — pick a company to manage its capability matrix. Flag-gated.
export default async function EntitlementsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ENTITLEMENTS_ENABLED()) notFound();
  if (!ctx.isPlatformOwner && !ctx.isSuperAdmin) notFound();

  const { t } = await getT();
  const supabase = await createClient();
  const companies = await loadCompanies(supabase);

  return (
    <ModulePage title={t('entitlements.title')} subtitle={t('entitlements.pickCompany')}>
      {companies.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('entitlements.none')}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {companies.map((c) => (
            <Link key={c.id} href={`/platform/entitlements/${c.id}`} className="block">
              <Card className="transition-colors hover:bg-secondary/50">
                <CardContent className="flex items-center justify-between gap-3 pt-6">
                  <span className="text-sm font-medium">{c.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </ModulePage>
  );
}
