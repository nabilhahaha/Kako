import { useTranslation } from 'react-i18next';
import type { RawCustomer } from '../types';

interface PlanningScopeProps {
  customers: RawCustomer[];
  cities: string[];
  branches: string[];
  selectedCity: string;
  selectedBranch: string;
  excludeInactive: boolean;
  onCityChange: (city: string) => void;
  onBranchChange: (branch: string) => void;
  onExcludeInactiveChange: (val: boolean) => void;
  scopeCount: number;
}

export function PlanningScope({
  cities,
  branches,
  selectedCity,
  selectedBranch,
  excludeInactive,
  onCityChange,
  onBranchChange,
  onExcludeInactiveChange,
  scopeCount,
}: PlanningScopeProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h2 className="text-h2 font-semibold">{t('scope.title')}</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">{t('scope.selectCity')}</label>
          <select
            value={selectedCity}
            onChange={(e) => onCityChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t('scope.allCities')}</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{t('scope.selectBranch')}</label>
          <select
            value={selectedBranch}
            onChange={(e) => onBranchChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t('scope.allBranches')}</option>
            {branches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={excludeInactive}
              onChange={(e) => onExcludeInactiveChange(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">{t('scope.excludeInactive')}</span>
          </label>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 px-4 py-3">
        <span className="text-sm text-muted-foreground">{t('scope.customersInScope', { count: scopeCount })}: </span>
        <span className="text-lg font-bold text-primary">{scopeCount.toLocaleString()}</span>
      </div>
    </div>
  );
}
