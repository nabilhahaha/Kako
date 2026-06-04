'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Save, FilePlus2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import type { SurveyQuestion, SurveyQuestionType } from '@/lib/erp/survey';
import { saveSurvey, deleteSurvey } from './actions';

export interface SurveyRow {
  id: string; name: string; name_ar: string | null; description: string | null;
  questions: SurveyQuestion[]; is_active: boolean;
}

const TYPES: SurveyQuestionType[] = ['yesno', 'rating', 'number', 'select', 'text', 'photo'];
const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
const blankQ = (): SurveyQuestion => ({ key: '', label: '', type: 'yesno', weight: 1, required: false });

export function SurveyBuilder({ surveys }: { surveys: SurveyRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([blankQ()]);
  const [busy, setBusy] = useState(false);

  function newSurvey() { setEditingId(null); setName(''); setQuestions([blankQ()]); }
  function loadForEdit(s: SurveyRow) { setEditingId(s.id); setName(s.name); setQuestions(s.questions.length ? s.questions : [blankQ()]); }
  function patchQ(i: number, patch: Partial<SurveyQuestion>) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, ...patch } : q)); }

  async function save() {
    setBusy(true);
    try {
      const res = await saveSurvey({ id: editingId ?? undefined, name, questions });
      if (!res.ok) { toast.error(res.error ?? t('retail.survey.error')); return; }
      toast.success(t('retail.survey.saved'));
      newSurvey();
      router.refresh();
    } finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!window.confirm('?')) return;
    const res = await deleteSurvey(id);
    if (!res.ok) { toast.error(res.error ?? t('retail.survey.error')); return; }
    toast.success(t('retail.survey.deleted'));
    if (editingId === id) newSurvey();
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Survey list */}
      <Card className="lg:col-span-1">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('retail.survey.list')}</h2>
            <Button size="sm" variant="secondary" onClick={newSurvey}><FilePlus2 className="h-4 w-4" /> {t('retail.survey.new')}</Button>
          </div>
          {surveys.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('retail.survey.empty')}</p>
          ) : surveys.map((s) => (
            <div key={s.id} className={`flex items-center justify-between rounded-md border p-2 text-sm ${editingId === s.id ? 'border-primary bg-primary/5' : ''}`}>
              <button type="button" className="text-start" onClick={() => loadForEdit(s)}>
                {s.name}
                {s.is_active ? <Badge variant="success" className="ms-2">{t('retail.survey.active')}</Badge> : null}
                <div className="text-xs text-muted-foreground">{s.questions.length} · {t('retail.survey.question')}</div>
              </button>
              <Button size="sm" variant="outline" onClick={() => del(s.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Editor */}
      <Card className="lg:col-span-2">
        <CardContent className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">{t('retail.survey.builder')}</h2>
          <Input placeholder={t('retail.survey.name')} value={name} onChange={(e) => setName(e.target.value)} />

          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="h-9 w-28" placeholder={t('retail.survey.qkey')} value={q.key} onChange={(e) => patchQ(i, { key: e.target.value })} />
                  <Input className="h-9 flex-1 min-w-[10rem]" placeholder={t('retail.survey.qlabel')} value={q.label} onChange={(e) => patchQ(i, { label: e.target.value })} />
                  <select className={selectCls} value={q.type} onChange={(e) => patchQ(i, { type: e.target.value as SurveyQuestionType })}>
                    {TYPES.map((ty) => <option key={ty} value={ty}>{t(`retail.survey.types.${ty}`)}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <label className="flex items-center gap-1">{t('retail.survey.qweight')}
                    <Input className="h-8 w-16" type="number" value={q.weight ?? 1} onChange={(e) => patchQ(i, { weight: Number(e.target.value) || 1 })} />
                  </label>
                  {(q.type === 'rating' || q.type === 'number') && (
                    <label className="flex items-center gap-1">{t('retail.survey.qmax')}
                      <Input className="h-8 w-16" type="number" value={q.max ?? ''} onChange={(e) => patchQ(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    </label>
                  )}
                  {q.type === 'select' && (
                    <label className="flex flex-1 items-center gap-1">{t('retail.survey.qoptions')}
                      <Input className="h-8 flex-1" placeholder="a,b,c"
                        value={(q.options ?? []).map((o) => o.value).join(',')}
                        onChange={(e) => patchQ(i, { options: e.target.value.split(',').map((v) => v.trim()).filter(Boolean).map((v) => ({ value: v })) })} />
                    </label>
                  )}
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!!q.required} onChange={(e) => patchQ(i, { required: e.target.checked })} /> {t('retail.survey.qrequired')}
                  </label>
                </div>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setQuestions((qs) => [...qs, blankQ()])}><Plus className="h-4 w-4" /> {t('retail.survey.addQuestion')}</Button>
          </div>

          <div className="border-t pt-3">
            <Button disabled={busy || !name.trim()} onClick={save}><Save className="h-4 w-4" /> {t('retail.survey.save')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
