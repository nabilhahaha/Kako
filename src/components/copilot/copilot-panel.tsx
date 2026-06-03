'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HelpCircle,
  ListChecks,
  ShieldQuestion,
  GraduationCap,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  screenHelp,
  nextBestActions,
  whyBlocked,
  relevantWhyActions,
  training,
  type ScreenHelpData,
  type AttentionItem,
  type WhyOption,
} from '@/app/(app)/copilot/actions';
import {
  trainingTopics,
  type BlockAnalysis,
  type TrainingResult,
} from '@/lib/erp/copilot/copilot-engine';

type Tab = 'screen' | 'now' | 'why' | 'learn';

const SEVERITY_VARIANT: Record<AttentionItem['severity'], 'info' | 'warning' | 'destructive'> = {
  info: 'info',
  warning: 'warning',
  danger: 'destructive',
};

/** The interactive help content. Rendered inside the floating panel; receives
 *  the current route and a close callback so chips/links can navigate + dismiss. */
export function CopilotPanel({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('screen');

  const go = useCallback(
    (href: string) => {
      router.push(href);
      onNavigate();
    },
    [router, onNavigate],
  );

  const tabs: { id: Tab; label: string; icon: typeof HelpCircle }[] = [
    { id: 'screen', label: t('copilot.tabScreen'), icon: HelpCircle },
    { id: 'now', label: t('copilot.tabNow'), icon: ListChecks },
    { id: 'why', label: t('copilot.tabWhy'), icon: ShieldQuestion },
    { id: 'learn', label: t('copilot.tabLearn'), icon: GraduationCap },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Tab strip — scrollable on narrow screens, RTL-aware via logical flow. */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b p-2">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tb.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'screen' && <ScreenTab pathname={pathname} locale={locale} t={t} onAsk={() => setTab('why')} />}
        {tab === 'now' && <NowTab locale={locale} t={t} go={go} />}
        {tab === 'why' && <WhyTab locale={locale} t={t} />}
        {tab === 'learn' && <LearnTab locale={locale} t={t} />}
      </div>
    </div>
  );
}

type TFn = ReturnType<typeof useI18n>['t'];

function Loading({ t }: { t: TFn }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {t('copilot.loading')}
    </div>
  );
}

// ── This screen ───────────────────────────────────────────────────────────────
function ScreenTab({
  pathname,
  locale,
  t,
  onAsk,
}: {
  pathname: string;
  locale: 'en' | 'ar';
  t: TFn;
  onAsk: () => void;
}) {
  const [data, setData] = useState<ScreenHelpData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    screenHelp(pathname, locale).then((res) => {
      if (!alive) return;
      setData(res.ok ? (res.data ?? null) : null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pathname, locale]);

  if (loading) return <Loading t={t} />;
  if (!data?.explanation)
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('copilot.noScreenHelp')}</p>;

  const { explanation, questions } = data;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{explanation.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{explanation.purpose}</p>
      </div>

      {explanation.actions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('copilot.screenActions')}
          </p>
          <ul className="space-y-1 text-sm">
            {explanation.actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {questions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('copilot.screenQuestions')}
          </p>
          <div className="flex flex-wrap gap-2">
            {questions.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={onAsk}
                className="rounded-full border bg-secondary/50 px-3 py-1.5 text-sm hover:bg-secondary"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── What should I do now? ─────────────────────────────────────────────────────
function NowTab({
  locale,
  t,
  go,
}: {
  locale: 'en' | 'ar';
  t: TFn;
  go: (href: string) => void;
}) {
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    nextBestActions(locale).then((res) => {
      if (!alive) return;
      setItems(res.ok ? (res.data ?? []) : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  if (loading) return <Loading t={t} />;
  if (!items || items.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <CheckCircle2 className="h-8 w-8 text-success" />
        {t('copilot.nowEmpty')}
      </div>
    );

  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => go(it.href)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-start transition-colors hover:bg-secondary/50"
          >
            <span className="flex items-center gap-2">
              <Badge variant={SEVERITY_VARIANT[it.severity]}>{it.count}</Badge>
              <span className="text-sm font-medium">{it.title}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {t('copilot.nowOpen')}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Why can't I…? ─────────────────────────────────────────────────────────────
function WhyTab({ locale, t }: { locale: 'en' | 'ar'; t: TFn }) {
  const [options, setOptions] = useState<WhyOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<BlockAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    relevantWhyActions(locale).then((res) => {
      if (alive && res.ok) setOptions(res.data ?? []);
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  const pick = (key: string) => {
    setSelected(key);
    setAnalysis(null);
    setLoading(true);
    whyBlocked(key, locale).then((res) => {
      setAnalysis(res.ok ? (res.data ?? null) : null);
      setLoading(false);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('copilot.whyPick')}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => pick(o.key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              selected === o.key ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 hover:bg-secondary'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {loading && <Loading t={t} />}

      {!loading && analysis && (
        <div className="rounded-lg border bg-card p-3">
          <p className="text-sm font-semibold">{analysis.actionLabel}</p>
          {analysis.allowed ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              {t('copilot.whyAllowed')}
            </p>
          ) : (
            <ul className="mt-2 space-y-3">
              {analysis.reasons.map((r, i) => (
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
          )}
        </div>
      )}
    </div>
  );
}

// ── Learn ─────────────────────────────────────────────────────────────────────
function LearnTab({ locale, t }: { locale: 'en' | 'ar'; t: TFn }) {
  const topics = trainingTopics(locale);
  const [selected, setSelected] = useState<string | null>(null);
  const [guide, setGuide] = useState<TrainingResult | null>(null);
  const [loading, setLoading] = useState(false);

  const pick = (key: string) => {
    setSelected(key);
    setGuide(null);
    setLoading(true);
    training(key, locale).then((res) => {
      setGuide(res.ok ? (res.data ?? null) : null);
      setLoading(false);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('copilot.learnPick')}</p>
      <div className="flex flex-wrap gap-2">
        {topics.map((tp) => (
          <button
            key={tp.key}
            type="button"
            onClick={() => pick(tp.key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              selected === tp.key ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 hover:bg-secondary'
            }`}
          >
            {tp.title}
          </button>
        ))}
      </div>

      {loading && <Loading t={t} />}

      {!loading && guide && (
        <div className="rounded-lg border bg-card p-3">
          <p className="text-sm font-semibold">{guide.title}</p>
          {!guide.permitted && (
            <p className="mt-1 text-xs text-warning">{t('copilot.learnNotPermitted')}</p>
          )}
          <ol className="mt-2 space-y-2">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
