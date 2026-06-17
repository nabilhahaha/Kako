'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Boxes, HandCoins, LockOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import type { MyRequest, RequestCustomer, RequestRoute, RequestSalesman } from '@/lib/van-sales/requests-server';
import { CustomerRequestForms } from './customer-request-forms';

const TONE: Record<MyRequest['tone'], 'secondary' | 'success' | 'destructive'> = { pending: 'secondary', done: 'success', rejected: 'destructive' };

/** Request-type tile (icon + title + short description), sized for a responsive
 *  grid and a comfortable mobile touch target. The wrapping <Link>/<button>
 *  carries the (unchanged) action — every tile NAVIGATES to a dedicated screen. */
function RequestTile({ icon, title, desc, muted }: { icon: ReactNode; title: string; desc: string; muted?: boolean }) {
  return (
    <Card className="h-full transition-colors hover:bg-secondary/50">
      <CardContent className="flex h-full min-h-[96px] flex-col items-start gap-1.5 p-3">
        <span className={muted ? 'text-muted-foreground' : 'text-primary'}>{icon}</span>
        <div className="text-sm font-medium leading-tight">{title}</div>
        <div className="text-xs leading-snug text-muted-foreground">{desc}</div>
      </CardContent>
    </Card>
  );
}

export function RequestsHub({
  myRequests, canLoad, canCash, canReopen, dayClosed, canCustomer, customers, routes, salesmen,
}: {
  myRequests: MyRequest[];
  canLoad: boolean; canCash: boolean; canReopen: boolean; dayClosed: boolean;
  canCustomer: boolean; customers: RequestCustomer[]; routes: RequestRoute[]; salesmen: RequestSalesman[];
}) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar' : 'en'); } catch { return iso; } };

  return (
    <div className="space-y-4">
      {/* Request types — responsive card/tile grid. Each tile navigates to its own
          dedicated screen. 2 per row on mobile, expanding on larger screens. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {canLoad && (
          <Link href="/field/van-sales/request" className="block h-full">
            <RequestTile icon={<Boxes className="h-5 w-5" />} title={t('vanSales.requests.load')} desc={t('vanSales.requests.loadDesc')} />
          </Link>
        )}

        {canCash && (
          <Link href="/field/van-sales/requests/cash" className="block h-full">
            <RequestTile icon={<HandCoins className="h-5 w-5" />} title={t('vanSales.requests.cashHandover')} desc={t('vanSales.requests.cashDesc')} />
          </Link>
        )}

        {canReopen && (
          dayClosed ? (
            <Link href="/today" className="block h-full">
              <RequestTile icon={<LockOpen className="h-5 w-5" />} title={t('vanSales.requests.reopen')} desc={t('vanSales.requests.reopenReady')} />
            </Link>
          ) : (
            // Day is open → do NOT navigate; show the agreed message inline.
            <button type="button" className="block h-full w-full text-start" onClick={() => toast.error(t('vanSales.requests.reopenDayOpen'))}>
              <RequestTile icon={<LockOpen className="h-5 w-5" />} title={t('vanSales.requests.reopen')} desc={t('vanSales.requests.reopenWhenClosed')} muted />
            </button>
          )
        )}

        {/* Governed customer requests render their own navigating tiles in the same grid. */}
        {canCustomer && <CustomerRequestForms customers={customers} routes={routes} salesmen={salesmen} />}
      </div>

      {/* My requests */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.requests.myRequests')}</h2>
        {myRequests.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('vanSales.requests.empty')}</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {myRequests.map((r) => (
                  <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{t(`vanSales.requests.kind.${r.kind}`)}{r.amount != null ? ` · ${formatCurrency(r.amount, 'EGP', intl)}` : ''}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(r.createdAt)}
                        {r.kind === 'load' && r.requestedDate ? ` · ${t('vanSales.requests.loadingDateShort')}: ${r.requestedDate}${r.approvedDate && r.approvedDate !== r.requestedDate ? ` → ${r.approvedDate}` : ''}` : ''}
                      </div>
                    </div>
                    <Badge variant={TONE[r.tone]}>{t(`vanSales.requests.st.${r.tone}`)}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
