'use client';

import { useEffect, useState } from 'react';
import { Inbox, MapPin, Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getRequestCenter, type RequestRow, type RpRequestStatus } from './rp-requests-read-actions';

/**
 * Phase C3 — read-only Route Planner request center. Lists requests with their type +
 * approval status. No writes: submit/approve flows drive the approval state machine and
 * are deferred to a later reported phase.
 */
const STATUS_TINT: Record<RpRequestStatus, string> = {
  created: 'bg-slate-100 text-slate-700',
  pending_manager_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  pending_admin_action: 'bg-blue-100 text-blue-800',
  implemented_externally: 'bg-teal-100 text-teal-800',
  closed: 'bg-zinc-100 text-zinc-700',
  rejected: 'bg-red-100 text-red-800',
  need_more_info: 'bg-violet-100 text-violet-800',
  cancelled: 'bg-zinc-100 text-zinc-500',
};

export function RequestCenterPanel() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await getRequestCenter();
      if (res.ok) { setRows(res.data.rows); setOpenCount(res.data.openCount); }
      setLoaded(true);
    })();
  }, []);

  const dateFmt = (s: string) => new Date(s).toLocaleDateString(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' });

  if (!loaded) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('rpReq.loading')}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold">{t('rpReq.title')}</p>
        <span className="text-[11px] text-muted-foreground">{t('rpReq.openOf', { open: openCount, total: rows.length })}</span>
      </div>

      {rows.length === 0 && <p className="rounded-lg border px-3 py-6 text-center text-xs text-muted-foreground">{t('rpReq.empty')}</p>}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_ticket')}</th>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_type')}</th>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_customer')}</th>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_status')}</th>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-2.5 py-1.5 font-mono text-[11px]">{r.ticketNo ?? '—'}</td>
                  <td className="px-2.5 py-1.5">{t(`rpReq.type_${r.type}` as 'rpReq.type_update')}</td>
                  <td className="px-2.5 py-1.5">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{r.customerRef ?? '—'}</span>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TINT[r.status]}`}>{t(`rpReq.st_${r.status}` as 'rpReq.st_created')}</span>
                  </td>
                  <td className="px-2.5 py-1.5 text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{dateFmt(r.createdAt)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{t('rpReq.readOnlyNote')}</p>
    </div>
  );
}
