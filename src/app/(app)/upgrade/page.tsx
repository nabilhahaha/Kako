import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import { whatsappLink, SUPPORT_PHONE_DISPLAY } from '@/lib/erp/contact';
import { Lock, MessageCircle } from 'lucide-react';
import { getT } from '@/lib/i18n/server';

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  const { module } = await searchParams;
  const moduleLabel = module && module in MODULE_LABELS ? MODULE_LABELS[module as Module] : null;
  const companyName = ctx.company?.name_ar || ctx.company?.name || '';

  const msg = moduleLabel
    ? t('upgrade.whatsappMsgModule', { module: moduleLabel, company: companyName })
    : t('upgrade.whatsappMsgGeneral', { company: companyName });

  return (
    <div>
      <PageHeader title={t('upgrade.pageTitle')} description={t('upgrade.pageDescription')} />
      <Card className="mx-auto max-w-md">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold">
            {moduleLabel
              ? t('upgrade.moduleLockedTitle', { module: moduleLabel })
              : t('upgrade.featureLockedTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('upgrade.body')}
          </p>
          <a
            href={whatsappLink(msg)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-success px-4 font-medium text-success-foreground hover:opacity-90"
          >
            <MessageCircle className="h-5 w-5" /> {t('upgrade.contactWhatsapp')}
          </a>
          <p className="text-xs text-muted-foreground" dir="ltr">{SUPPORT_PHONE_DISPLAY}</p>
        </CardContent>
      </Card>
    </div>
  );
}
