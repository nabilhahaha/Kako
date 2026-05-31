'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Circle, Rocket, X, ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

export interface GettingStartedStep {
  label: string;
  href: string;
  done: boolean;
}

/** First-run checklist for a fresh company. Auto-hides once every step is done,
 *  and can be dismissed (remembered in localStorage). */
export function GettingStarted({
  steps,
  storageKey = 'kako_getting_started_dismissed',
}: {
  steps: GettingStartedStep[];
  storageKey?: string;
}) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  const done = steps.filter((s) => s.done).length;
  if (!mounted || dismissed || done === steps.length) return null;

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Rocket className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">{t('shared.gettingStarted.title')}</h2>
              <p className="text-xs text-muted-foreground">{t('shared.gettingStarted.subtitle', { done, total: steps.length })}</p>
            </div>
          </div>
          <button
            onClick={() => { localStorage.setItem(storageKey, '1'); setDismissed(true); }}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
            aria-label={t('shared.gettingStarted.hide')}
            title={t('shared.gettingStarted.hide')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-1">
          {steps.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-secondary"
              >
                {s.done
                  ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
                <span className={s.done ? 'text-muted-foreground line-through' : 'font-medium'}>{s.label}</span>
                {!s.done && (
                  <ArrowLeft className="ms-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
