import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Rocket, ArrowRight } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { SETTINGS_SECTIONS, canSeeSettingsItem } from '@/lib/erp/settings-sections';

/**
 * Settings home — a business-friendly landing rendered in the center of the
 * persistent Settings navigation (the nav lives in settings/layout.tsx). Pure
 * navigation/discoverability; permission-aware. No data writes, no logic change.
 */
export default async function SettingsHomePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const sections = SETTINGS_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => canSeeSettingsItem(ctx, i)) }))
    .filter((s) => s.items.length > 0);

  const showGoLive = hasPermission(ctx, 'integrations.manage');

  return (
    <div>
      <PageHeader title={t('settingsHome.title')} description={t('settingsHome.description')} />

      {showGoLive && (
        <Link href="/settings/go-live" className="mb-6 block">
          <Card className="border-primary/40 transition-colors hover:bg-primary/5">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Rocket className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t('settingsHome.goLiveTitle')}</p>
                <p className="text-sm text-muted-foreground">{t('settingsHome.goLiveDesc')}</p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.title} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t(s.title)}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.items.map((i) => (
                <Link key={i.href} href={i.href} className="block h-full">
                  <Card className="h-full transition-colors hover:bg-secondary/50">
                    <CardContent className="flex h-full items-start gap-3 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                        <i.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium leading-tight">{t(i.label)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t(i.desc)}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
