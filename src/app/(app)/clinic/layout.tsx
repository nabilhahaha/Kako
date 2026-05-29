import { requireAnyPermission } from '@/lib/erp/guards';

export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  // Any clinic role may enter the section; individual pages narrow further.
  await requireAnyPermission(['clinic.manage', 'clinic.reception', 'clinic.doctor']);
  return <>{children}</>;
}
