'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X, User, UserPlus, FileEdit, MapPin, CreditCard, CalendarClock, Shuffle, RotateCcw, Ban, AlertTriangle, Paperclip } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { decideCustomerRequest, type PendingCustomerRequest } from '@/lib/van-sales/requests-server';

const ICON = { new_customer: UserPlus, data_update: FileEdit, gps_correction: MapPin, credit_limit: CreditCard, payment_terms: CalendarClock, route_transfer: Shuffle, reactivate: RotateCcw, close: Ban } as const;

export function CustomerRequestList({ requests }: { requests: PendingCustomerRequest[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString(locale === 'ar' ? 'ar' : 'en'); } catch { return iso; } };

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id);
    try {
      const res = await decideCustomerRequest({ requestId: id, decision, note: notes[id] });
      if (!res.ok) { toast.error(res.error ?? '—'); return; }
      toast.success(t(decision === 'approve' ? 'vanSales.requests.custInbox.approved' : 'vanSales.requests.custInbox.rejected'));
      router.refresh();
    } finally { setBusy(null); }
  }

  // Show the payload as readable rows (skip empty + internal keys).
  function rows(p: Record<string, unknown>) {
    const skip = new Set(['branch_id', 'route_id', 'req_route', 'req_salesman']);
    return Object.entries(p)
      .filter(([k, v]) => !skip.has(k) && v != null && String(v).trim() !== '')
      .map(([k, v]) => ({ k, v: String(v) }));
  }

  if (requests.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('vanSales.requests.custInbox.empty')}</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const Icon = ICON[r.kind as keyof typeof ICON] ?? FileEdit;
        return (
          <Card key={r.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Badge variant="secondary" className="gap-1"><Icon className="h-3.5 w-3.5" /> {t(`vanSales.requests.kind.${r.kind}`)}</Badge>
                {r.customerName && <span className="font-medium">{r.customerName}</span>}
                <span className="inline-flex items-center gap-1.5 text-muted-foreground"><User className="h-4 w-4" /> {r.salesmanName}</span>
                <span className="text-xs text-muted-foreground">{fmt(r.createdAt)}</span>
              </div>

              {/* Duplicate detection — possible existing-customer matches. */}
              {r.duplicates.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-warning">
                    <AlertTriangle className="h-4 w-4" /> {t('vanSales.requests.custInbox.duplicates')}
                  </div>
                  <ul className="space-y-0.5">
                    {r.duplicates.map((d) => (
                      <li key={d.id} className="text-xs">
                        <span className="font-medium">{d.name}</span> · {d.code} — <span className="text-muted-foreground">{d.reasons.map((x) => t(`vanSales.requests.dup.${x}`)).join('، ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {rows(r.payload).map(({ k, v }) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{t(`vanSales.requests.pl.${k}`) || k}</dt>
                      <dd className="font-medium break-words" dir="auto">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Attachments (storefront / CR / VAT / …) */}
              {r.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {r.attachments.map((a) => (
                    <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary">
                      <Paperclip className="h-3 w-3" /> {a.doc_type ? t(`vanSales.requests.doc.${a.doc_type}`) : a.file_name}
                    </a>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{t('vanSales.requests.custInbox.noteLabel')}</Label>
                <input
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" loading={busy === r.id} onClick={() => decide(r.id, 'reject')}>
                  {busy === r.id ? t('common.processing') : <><X className="h-4 w-4" /> {t('vanSales.requests.custInbox.reject')}</>}
                </Button>
                <Button className="flex-1" loading={busy === r.id} onClick={() => decide(r.id, 'approve')}>
                  {busy === r.id ? t('common.processing') : <><Check className="h-4 w-4" /> {t('vanSales.requests.custInbox.approve')}</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
