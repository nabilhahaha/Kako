import { requirePermission } from '@/lib/erp/guards';

export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('clinic.manage');
  return <>{children}</>;
}
