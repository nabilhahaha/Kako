import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { drugReferenceCount } from '../../clinic/reference-actions';
import { DrugImporter } from './drug-importer';
import { getT } from '@/lib/i18n/server';

export default async function PlatformDrugsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.isPlatformOwner) redirect('/dashboard');

  const count = await drugReferenceCount();

  return (
    <div>
      <PageHeader
        title={t('platform.drugs.title')}
        description={t('platform.drugs.description')}
      />
      <DrugImporter initialCount={count} />
    </div>
  );
}
