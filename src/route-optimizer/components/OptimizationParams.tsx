import { useTranslation } from 'react-i18next';
import type { OptimizationParams as Params } from '../types';

interface OptimizationParamsProps {
  params: Params;
  onChange: (params: Params) => void;
  onRun: () => void;
  isOptimizing: boolean;
  customerCount: number;
}

function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function OptimizationParamsPanel({ params, onChange, onRun, isOptimizing, customerCount }: OptimizationParamsProps) {
  const { t } = useTranslation();

  const update = <K extends keyof Params>(key: K, value: Params[K]) => {
    onChange({ ...params, [key]: value });
  };

  const suggestedRoutes = params.customersPerRoute > 0
    ? Math.ceil(customerCount / params.customersPerRoute)
    : params.numberOfRoutes;

  return (
    <div className="space-y-6">
      <h2 className="text-h2 font-semibold">{t('params.title')}</h2>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t('params.distributionMethod')}</label>
          <div className="flex gap-2">
            <button
              onClick={() => update('distributionMethod', 'count')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                params.distributionMethod === 'count'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {t('params.countMode')}
            </button>
            <button
              onClick={() => update('distributionMethod', 'workload')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                params.distributionMethod === 'workload'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {t('params.workloadMode')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberInput
            label={t('params.numberOfRoutes')}
            value={params.numberOfRoutes}
            onChange={(v) => update('numberOfRoutes', Math.max(1, v))}
            min={1}
            max={300}
          />

          {params.distributionMethod === 'count' && (
            <NumberInput
              label={t('params.customersPerRoute')}
              value={params.customersPerRoute}
              onChange={(v) => update('customersPerRoute', Math.max(1, v))}
              min={1}
              hint={`${t('params.numberOfRoutes')}: ~${suggestedRoutes}`}
            />
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">{t('params.workingDaysPerWeek')}</label>
            <select
              value={params.workingDaysPerWeek}
              onChange={(e) => update('workingDaysPerWeek', Number(e.target.value) as 4 | 5 | 6)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value={6}>{t('params.workingDays.six')}</option>
              <option value={5}>5</option>
              <option value={4}>4</option>
            </select>
          </div>

          <NumberInput
            label={t('params.avgVisitTime')}
            value={params.avgVisitTime}
            onChange={(v) => update('avgVisitTime', Math.max(1, v))}
            min={1}
            unit={t('params.avgVisitTimeUnit')}
          />

          <NumberInput
            label={t('params.workingHoursPerDay')}
            value={params.workingHoursPerDay}
            onChange={(v) => update('workingHoursPerDay', Math.max(1, v))}
            min={1}
            max={24}
            unit={t('common.hours')}
          />

          <NumberInput
            label={t('params.avgSpeed')}
            value={params.avgSpeed}
            onChange={(v) => update('avgSpeed', Math.max(1, v))}
            min={1}
            unit={t('params.speedUnit')}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('params.weeklyFrequencySource')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => update('frequencySource', 'automatic')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  params.frequencySource === 'automatic'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('params.automatic')}
              </button>
              <button
                onClick={() => update('frequencySource', 'uniform')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  params.frequencySource === 'uniform'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('params.uniform')}
              </button>
            </div>
          </div>

          {params.frequencySource === 'uniform' && (
            <div>
              <label className="mb-1 block text-sm font-medium">{t('params.frequencyPerWeek')}</label>
              <select
                value={params.uniformFrequency}
                onChange={(e) => update('uniformFrequency', Number(e.target.value) as 1 | 2 | 3)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={1}>1 {t('common.perWeek')}</option>
                <option value={2}>2 {t('common.perWeek')}</option>
                <option value={3}>3 {t('common.perWeek')}</option>
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberInput
            label={t('params.outlierIsolationDist')}
            value={params.outlierDistance}
            onChange={(v) => update('outlierDistance', Math.max(0, v))}
            min={0}
            unit={t('common.km')}
            hint={t('params.disabledHint')}
          />

          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={params.createOutstationRoutes}
                onChange={(e) => update('createOutstationRoutes', e.target.checked)}
                disabled={params.outlierDistance === 0}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">{t('params.createOutstationRoutes')}</span>
            </label>
          </div>

          <NumberInput
            label={t('params.outlierLinkDist')}
            value={params.outlierLinkDistance}
            onChange={(v) => update('outlierLinkDistance', Math.max(0, v))}
            min={0}
            unit={t('common.km')}
            disabled={!params.createOutstationRoutes || params.outlierDistance === 0}
          />

          <NumberInput
            label={t('params.dailyKmCap')}
            value={params.dailyKmCap}
            onChange={(v) => update('dailyKmCap', Math.max(0, v))}
            min={0}
            unit={t('common.km')}
            hint={t('params.disabledHint')}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberInput
            label="Fuel Price (SAR/L)"
            value={params.fuelPricePerLiter}
            onChange={(v) => update('fuelPricePerLiter', Math.max(0, v))}
            min={0}
            step={0.1}
            unit="SAR"
          />
          <NumberInput
            label="Fuel Consumption"
            value={params.fuelConsumption}
            onChange={(v) => update('fuelConsumption', Math.max(1, v))}
            min={1}
            unit="km/L"
          />
        </div>
      </div>

      <button
        onClick={onRun}
        disabled={isOptimizing}
        className="w-full rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isOptimizing ? t('params.optimizing') : t('params.runOptimization')}
      </button>
    </div>
  );
}
