import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { getT } from '@/lib/i18n/server';

/**
 * Safe landing page for the direct-route module guard. When a tenant user opens a URL
 * for a module their company does not have enabled, the (app) layout redirects here
 * (instead of rendering the gated page). Clear, bilingual message + a way back. The page
 * itself carries no module gate, so it is always reachable.
 */
export default async function ModuleUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale } = await getT();
  const ar = locale === 'ar';
  const { from } = await searchParams;

  const title = ar ? 'هذه الوحدة غير مفعّلة' : 'This module isn’t enabled';
  const body = ar
    ? 'هذه الميزة غير مفعّلة لشركتك. تواصل مع مدير الشركة أو مالك المنصة لتفعيلها.'
    : 'This feature is not enabled for your company. Contact your company administrator or the platform owner to enable it.';
  const back = ar ? 'العودة إلى لوحة التحكم' : 'Back to dashboard';

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-4" dir={ar ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {from && <p className="mt-3 font-mono text-[11px] text-muted-foreground/70" dir="ltr">{from}</p>}
        <Link
          href="/dashboard"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {back}
        </Link>
      </div>
    </div>
  );
}
