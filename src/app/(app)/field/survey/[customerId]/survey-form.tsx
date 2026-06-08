'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { scoreSurvey, type SurveyQuestion, type SurveyAnswers } from '@/lib/erp/survey';
import { submitSurveyResponse } from '@/app/(app)/settings/surveys/actions';
import { useOnlineStatus } from '@/lib/offline-sync/use-network';
import { enqueue } from '@/lib/offline-sync/client';

export interface ExecSurvey { id: string; name: string; name_ar: string | null; questions: SurveyQuestion[] }

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-2 text-sm';

export function SurveyForm({ customerId, surveys, offlineEnabled = false }: { customerId: string; surveys: ExecSurvey[]; offlineEnabled?: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const online = useOnlineStatus();
  const [surveyId, setSurveyId] = useState(surveys[0]?.id ?? '');
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [busy, setBusy] = useState(false);

  const survey = useMemo(() => surveys.find((s) => s.id === surveyId) ?? null, [surveys, surveyId]);
  const live = useMemo(() => survey ? scoreSurvey({ questions: survey.questions }, answers) : null, [survey, answers]);
  const sname = (s: ExecSurvey) => (locale === 'ar' && s.name_ar) ? s.name_ar : s.name;
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));

  async function submit() {
    if (!survey) return;
    setBusy(true);
    try {
      // OFFLINE: queue the response (scored + inserted server-side on sync).
      if (offlineEnabled && !online) {
        await enqueue('survey', 'create', { surveyId: survey.id, customerId, answers }, { entityId: customerId });
        toast.success(t('retail.survey.queuedOffline'));
        setAnswers({});
        return;
      }
      const res = await submitSurveyResponse({ surveyId: survey.id, customerId, answers });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('retail.survey.submitError')); return; }
      toast.success(t('retail.survey.submitted', { score: res.data.score }));
      setAnswers({});
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <select className={selectCls} value={surveyId} onChange={(e) => { setSurveyId(e.target.value); setAnswers({}); }}>
        {surveys.map((s) => <option key={s.id} value={s.id}>{sname(s)}</option>)}
      </select>

      {survey && (
        <Card>
          <CardContent className="space-y-4 p-4">
            {survey.questions.map((q) => {
              const label = (locale === 'ar' && q.labelAr) ? q.labelAr : q.label;
              const v = answers[q.key];
              return (
                <div key={q.key} className="space-y-1.5">
                  <Label>{label}{q.required && <span className="ms-1 text-destructive">*</span>}</Label>
                  {q.type === 'yesno' && (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant={v === 'yes' ? 'default' : 'outline'} onClick={() => set(q.key, 'yes')}>{t('retail.survey.yes')}</Button>
                      <Button type="button" size="sm" variant={v === 'no' ? 'default' : 'outline'} onClick={() => set(q.key, 'no')}>{t('retail.survey.no')}</Button>
                    </div>
                  )}
                  {q.type === 'rating' && (
                    <Input type="number" min={0} max={q.max ?? 5} value={(v as number) ?? ''} onChange={(e) => set(q.key, e.target.value === '' ? '' : Number(e.target.value))} />
                  )}
                  {q.type === 'number' && (
                    <Input type="number" value={(v as number) ?? ''} onChange={(e) => set(q.key, e.target.value === '' ? '' : Number(e.target.value))} />
                  )}
                  {q.type === 'select' && (
                    <select className={selectCls} value={(v as string) ?? ''} onChange={(e) => set(q.key, e.target.value)}>
                      <option value="">—</option>
                      {(q.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label ?? o.value}</option>)}
                    </select>
                  )}
                  {(q.type === 'text' || q.type === 'photo') && (
                    <Input value={(v as string) ?? ''} onChange={(e) => set(q.key, e.target.value)} placeholder={q.type === 'photo' ? 'https://…' : ''} />
                  )}
                </div>
              );
            })}
            {live && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">{t('retail.survey.score')}: <span className="font-semibold text-foreground">{live.score}%</span> · {t('retail.survey.completion')}: {live.completionPct}%</span>
                <Button disabled={busy || !live.complete} onClick={submit}><Send className="h-4 w-4" /> {t('retail.survey.submit')}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
