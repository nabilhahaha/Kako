import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface ProgressIndicatorProps {
  step: string;
  percent: number;
}

export function ProgressIndicator({ step, percent }: ProgressIndicatorProps) {
  const { t } = useTranslation();

  const stepLabel = {
    distributing: t('progress.stepDistributing'),
    sequencing: t('progress.stepSequencing'),
    allocating: t('progress.stepAllocating'),
    calculating: t('progress.stepCalculating'),
    completed: t('progress.completed'),
  }[step] ?? step;

  return (
    <div className="mx-auto max-w-md space-y-4 py-12 text-center">
      <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
      <h3 className="text-h2 font-semibold">{t('progress.title')}</h3>
      <div className="space-y-2">
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {stepLabel} — {Math.round(percent)}%
        </p>
      </div>
    </div>
  );
}
