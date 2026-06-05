import { requireAnyModule } from '@/lib/erp/guards';

export default async function SalesModuleLayout({ children }: { children: React.ReactNode }) {
  // Sales pages (invoices/returns/POS) also back the Fashion store pack, whose
  // returns/exchange/void flows reuse them — so a clothing tenant (fashion-only
  // module) may reach them too. The fashion sidebar surfaces only the curated
  // subset; the generic Sales section stays suppressed for clothing (0147/0155).
  await requireAnyModule(['sales', 'fashion']);
  return <>{children}</>;
}
