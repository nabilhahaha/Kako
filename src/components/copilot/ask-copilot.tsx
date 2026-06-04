'use client';

import { useState } from 'react';
import { Loader2, Send, CheckCircle2, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { askCopilot } from '@/app/(app)/copilot/ai-actions';
import type { AiAnswer } from '@/lib/copilot/ai/types';

/** "Ask Copilot" — free-text question box backed by the deterministic engine
 *  (AI-optional, flag-gated server-side). Renders the structured answer the
 *  server returns; never calls a model or the DB directly. */
export function AskCopilot() {
  const { t, locale } = useI18n();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setError(t('copilot.askErrorEmpty'));
      return;
    }
    setError(null);
    setLoading(true);
    setAnswer(null);
    const res = await askCopilot(trimmed, locale);
    setLoading(false);
    if (res.ok && res.data) setAnswer(res.data);
    else setError(t('copilot.askError'));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('copilot.askDescription')}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('copilot.askPlaceholder')}
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          aria-label={t('copilot.askTitle')}
        />
        <Button type="submit" disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:rotate-180" />}
          {loading ? t('copilot.askThinking') : t('copilot.askSend')}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !answer && !error && (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('copilot.askEmpty')}</p>
      )}

      {answer && <Answer answer={answer} onAsk={(q) => { setQuestion(q); void submit(q); }} t={t} />}

      <p className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        {t('copilot.askDeterministicNote')}
      </p>
    </div>
  );
}

type TFn = ReturnType<typeof useI18n>['t'];

function Answer({ answer, onAsk, t }: { answer: AiAnswer; onAsk: (q: string) => void; t: TFn }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-base font-semibold">{answer.title}</h3>

      {answer.answerKind === 'block' && answer.block && (
        answer.block.allowed ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            {t('copilot.whyAllowed')}
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {answer.block.reasons.map((r, i) => (
              <li key={i} className="rounded-md bg-secondary/40 p-2.5">
                <p className="text-sm font-medium">
                  {r.title}
                  {r.detail ? <span className="text-muted-foreground"> — {r.detail}</span> : null}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-semibold">{t('copilot.whyRemedy')}: </span>
                  {r.remedy}
                </p>
              </li>
            ))}
          </ul>
        )
      )}

      {answer.answerKind === 'screen' && answer.screen && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-muted-foreground">{answer.screen.purpose}</p>
          <ul className="space-y-1 text-sm">
            {answer.screen.actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {answer.answerKind === 'training' && answer.training && (
        <ol className="mt-2 space-y-2">
          {answer.training.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}

      {answer.answerKind === 'permission' && answer.permission && (
        <p className="mt-2 text-sm text-muted-foreground">
          {answer.permission.defaultRoles.join('، ')}
        </p>
      )}

      {answer.answerKind === 'unknown' && (
        <div className="mt-2 space-y-3">
          {answer.message && <p className="text-sm text-muted-foreground">{answer.message}</p>}
          {answer.suggestions && answer.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {answer.suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAsk(s)}
                  className="rounded-full border bg-secondary/50 px-3 py-1.5 text-sm hover:bg-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
