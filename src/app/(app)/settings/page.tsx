import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Rocket, ArrowRight } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { resolveSettingsNavGroups } from '@/lib/erp/settings-nav-server';
import { SETTINGS_DESCRIPTIONS } from '@/lib/erp/settings-sections';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Settings home — a business-friendly landing rendered in the center of the
 * canonical Settings navigation (the Top Grouping lives in settings/layout.tsx).
 * Derives its grouped cards from the SAME single source as the nav
 * (resolveSettingsNavGroups), so the grid and the tabs never diverge. Pure
 * navigation/discoverability; permission-aware. No data writes, no logic change.
 */
export default async function SettingsHomePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const groups = await resolveSettingsNavGroups(ctx);
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
        {groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t(g.key)}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((i) => {
                const desc = SETTINGS_DESCRIPTIONS[i.href];
                const Icon = i.icon;
                return (
                  <Link key={i.href} href={i.href} className="block h-full">
                    <Card className="h-full transition-colors hover:bg-secondary/50">
                      <CardContent className="flex h-full items-start gap-3 p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium leading-tight">{t(i.label)}</p>
                          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{t(desc)}</p>}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
