import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, ChevronLeft } from 'lucide-react';
import { getT } from '@/lib/i18n/server';

interface FormRow { id: string; key: string; name_ar: string | null; name_en: string | null; module: string | null; workflow_key: string | null }

/** Runtime form catalog (B5): active company forms a member can submit. */
export default async function FormsRuntimePage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_form_definitions')
    .select('id, key, name_ar, name_en, module, workflow_key')
    .eq('status', 'active').eq('is_latest', true)
    .not('company_id', 'is', null)
    .order('name_en', { ascending: true });
  const forms = (data as FormRow[]) ?? [];
  const name = (f: FormRow) => (locale === 'ar' ? f.name_ar || f.name_en : f.name_en || f.name_ar) || f.key;

  return (
    <div>
      <PageHeader title={t('formsRun.title')} description={t('formsRun.subtitle')} />
      {forms.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('formsRun.none')}</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((f) => (
            <Link key={f.id} href={`/forms/${f.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardContent className="flex items-start justify-between gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{name(f)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {f.module && <Badge variant="secondary">{f.module}</Badge>}
                        {f.workflow_key && <Badge variant="outline">{t('formsRun.needsApproval')}</Badge>}
                      </div>
                    </div>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
