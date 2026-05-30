import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { drugReferenceCount } from '../../clinic/reference-actions';
import { DrugImporter } from './drug-importer';

export default async function PlatformDrugsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.isPlatformOwner) redirect('/dashboard');

  const count = await drugReferenceCount();

  return (
    <div>
      <PageHeader
        title="قائمة الأدوية المصرية"
        description="القائمة المرجعية التي تظهر للأطباء في الروشتة (autocomplete). تُحمّل من قاعدة بيانات الأدوية المصرية المفتوحة."
      />
      <DrugImporter initialCount={count} />
    </div>
  );
}
