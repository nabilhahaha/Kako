import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { ExportsClient } from './exports-client';

export default async function ExportsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  return (
    <div>
      <PageHeader title="تصدير البيانات" description="تصدير الحركات كبيانات خام (CSV يفتح في إكسل)" />
      <ExportsClient />
    </div>
  );
}
