import { requireNonRetailAdmin } from '@/lib/erp/guards';

// Retail Mode hardening: the internal Design System showcase is not a tenant
// feature — block it for single-store retail tenants (it is a client page, so the
// guard lives in this server layout).
export default async function DesignLayout({ children }: { children: React.ReactNode }) {
  await requireNonRetailAdmin();
  return <>{children}</>;
}
