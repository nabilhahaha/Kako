import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { CustomerStatementView } from '@/components/customers/customer-statement';
import { loadCustomerStatement } from '@/lib/erp/customer-statement-server';
import { EntityNotes } from '@/components/entity/entity-notes';
import { Badge } from '@/components/ui/badge';
import { CUSTOMER_STATUSES } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import type { ErpCustomer } from '@/lib/erp/types';
import { BackLink } from '@/components/shared/back-link';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { CreditRequestButton } from './credit-request-button';

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t, locale } = await getT();

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from('erp_customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!customer) notFound();
  const c = customer as ErpCustomer;

  // FP-CS: resolve the status reason label + who last changed it for the 360 view.
  let statusReasonName = '';
  if (c.status_reason_id) {
    const { data: rl } = await supabase.from('erp_customer_lookups').select('name, name_ar').eq('id', c.status_reason_id).maybeSingle();
    const r = rl as { name: string; name_ar: string | null } | null;
    if (r) statusReasonName = locale === 'ar' ? r.name_ar || r.name : r.name;
  }
  let statusChangedByName = '';
  if (c.status_changed_by) {
    const { data: pf } = await supabase.from('erp_profiles').select('full_name, email').eq('id', c.status_changed_by).maybeSingle();
    const p = pf as { full_name: string | null; email: string | null } | null;
    if (p) statusChangedByName = p.full_name || p.email || '';
  }
  const statusLabel = CUSTOMER_STATUSES.find((s) => s.value === c.customer_status)?.[locale] ?? c.customer_status;
  const statusTone = c.customer_status === 'active' ? 'success' : c.customer_status === 'blocked' ? 'destructive' : 'warning';

  // THE authoritative statement (summary + aging + open invoices + reconciling
  // ledger). Same builder feeds the print/PDF view, so they cannot diverge.
  const sres = await loadCustomerStatement(supabase, id);

  const customerName = c.name_ar || c.name;
  const description = c.phone
    ? t('customers.stmtDescriptionWithPhone', { code: c.code, phone: c.phone })
    : t('customers.stmtDescription', { code: c.code });

  return (
    <div>
      <BackLink href="/customers" label={t('customers.stmtBackLink')} />
      <PageHeader
        title={t('customers.stmtTitle', { name: customerName })}
        description={description}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {Number(c.balance) > 0 && (
              <WhatsAppButton
                phone={c.phone}
                label={t('customers.stmtWhatsAppLabel')}
                message={t('customers.stmtWhatsAppMsg', {
                  name: customerName,
                  amount: formatCurrency(c.balance),
                })}
                className="h-9 border px-3"
              />
            )}
          </div>
        }
      />

      {/* FP-CS: status + reason + last-change context — Sales/Finance/Collections. */}
      <div className={`mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-sm ${c.customer_status !== 'active' ? 'border-warning/40 bg-warning/5' : ''}`}>
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('customers.statusLabel')}:</span>
          <Badge variant={statusTone}>{statusLabel}</Badge>
        </span>
        {statusReasonName && (
          <span><span className="text-muted-foreground">{t('customers.fieldStatusReason')}:</span> {statusReasonName}{c.status_reason_note ? ` — ${c.status_reason_note}` : ''}</span>
        )}
        {c.status_changed_at && (
          <span className="text-muted-foreground">
            {t('customers.statusSinceLabel')}: <span dir="ltr">{new Date(c.status_changed_at).toLocaleDateString()}</span>
            {statusChangedByName ? ` · ${statusChangedByName}` : ''}
          </span>
        )}
        {c.customer_status !== 'active' && (
          <span className="text-xs text-muted-foreground">{t('customers.statusCollectionsNote')}</span>
        )}
      </div>

      {/* FMCG Wave 1 — credit-limit change request (credit.request.create). */}
      {hasPermission(ctx, 'credit.request.create') && (
        <div className="mb-4">
          <CreditRequestButton customerId={c.id} currentLimit={Number(c.credit_limit)} />
        </div>
      )}

      {sres && (
        <CustomerStatementView
          statement={sres.statement}
          printHref={`/print/statement/${id}`}
          collectHref="/collections"
          canCollect={hasPermission(ctx, 'sales.collect') || ctx.isSuperAdmin}
          showRecon
        />
      )}

      {/* Entity Framework — inherited Notes capability (build once, reuse everywhere) */}
      <div className="mt-6">
        <EntityNotes entity="customer" recordId={c.id} />
      </div>
    </div>
  );
}
