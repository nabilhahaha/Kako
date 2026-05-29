import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import { whatsappLink, SUPPORT_PHONE_DISPLAY } from '@/lib/erp/contact';
import { Lock, MessageCircle } from 'lucide-react';

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { module } = await searchParams;
  const moduleLabel = module && module in MODULE_LABELS ? MODULE_LABELS[module as Module] : null;
  const companyName = ctx.company?.name_ar || ctx.company?.name || '';

  const msg = moduleLabel
    ? `مرحباً، أريد تفعيل وحدة «${moduleLabel}» لشركة «${companyName}».`
    : `مرحباً، أريد ترقية خطة شركة «${companyName}».`;

  return (
    <div>
      <PageHeader title="ترقية الخطة" description="هذه الميزة غير متاحة في خطتك الحالية." />
      <Card className="mx-auto max-w-md">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold">
            {moduleLabel ? `وحدة «${moduleLabel}» غير مفعّلة` : 'هذه الميزة غير متاحة في خطتك'}
          </h2>
          <p className="text-sm text-muted-foreground">
            للترقية أو تفعيل وحدات إضافية لشركتك، تواصل معنا وسنفعّلها لك فوراً.
          </p>
          <a
            href={whatsappLink(msg)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-success px-4 font-medium text-success-foreground hover:opacity-90"
          >
            <MessageCircle className="h-5 w-5" /> تواصل عبر واتساب
          </a>
          <p className="text-xs text-muted-foreground" dir="ltr">{SUPPORT_PHONE_DISPLAY}</p>
        </CardContent>
      </Card>
    </div>
  );
}
