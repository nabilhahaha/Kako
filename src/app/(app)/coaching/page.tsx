import { redirect } from 'next/navigation';
import { GraduationCap, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { coachingData } from '@/app/(app)/home-actions';
import { coachingTips, type CoachingTip } from '@/lib/erp/coaching';

// Visit Coaching — deterministic, bilingual coaching tips from the rep's own
// field metrics (coverage / GPS / out-of-route / skipped). No external AI.

const SEV_ICON = { danger: AlertCircle, warning: AlertTriangle, info: Info } as const;
const SEV_CLS: Record<CoachingTip['severity'], string> = {
  danger: 'text-destructive',
  warning: 'text-warning',
  info: 'text-muted-foreground',
};

export default async function CoachingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();

  const res = await coachingData();
  const metrics = res.ok && res.data ? res.data : {};
  const tips = coachingTips(metrics, locale);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('home.coachingTitle')} description={t('home.coachingSubtitle')} />
      <ul className="space-y-3">
        {tips.map((tip, i) => {
          const Icon = SEV_ICON[tip.severity];
          return (
            <li key={i}>
              <Card>
                <CardContent className="flex items-start gap-3 p-4">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${SEV_CLS[tip.severity]}`} />
                  <p className="text-sm">{tip.text}</p>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <GraduationCap className="h-3.5 w-3.5" />
        {t('home.coachingNote')}
      </p>
    </div>
  );
}
