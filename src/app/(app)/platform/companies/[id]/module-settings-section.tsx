'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import {
  MODULE_ORDER, MODULE_LABELS,
  type ResolvedSetting, type ModuleSettingDef, type SettingValue,
} from '@/lib/erp/module-settings-catalog';

/**
 * Company 360 — Module Configuration / Workflow Settings (READ-ONLY, Phase 1).
 *
 * Renders each module's settings with their effective value (catalog default or a
 * company override) grouped by module. There is NO editing here yet and NOTHING is
 * enforced — this is the read foundation. Editing + enforcement arrive in later
 * phases. Only modules the company has enabled are shown.
 */
export function ModuleSettingsSection({
  settings,
  enabledModules,
}: {
  settings: ResolvedSetting[];
  enabledModules: string[];
}) {
  const { t, locale } = useI18n();
  const enabled = new Set(enabledModules);

  function renderValue(def: ModuleSettingDef, value: SettingValue) {
    if (def.type === 'boolean') {
      return (
        <Badge variant={value ? 'success' : 'secondary'}>
          {value ? t('platform.company.c360.wfOn') : t('platform.company.c360.wfOff')}
        </Badge>
      );
    }
    return <Badge variant="secondary" dir="ltr">{String(value)}</Badge>;
  }

  // Group resolved settings by module, preserving catalog order.
  const byModule = MODULE_ORDER
    .map((m) => ({ module: m, items: settings.filter((s) => s.def.module === m) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('platform.company.c360.wfIntro')}</p>

      {byModule.map(({ module, items }) => {
        const moduleOn = enabled.has(module);
        return (
          <Card key={module}>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-semibold">{MODULE_LABELS[module][locale]}</h3>
                {!moduleOn && <Badge variant="outline">{t('platform.company.c360.wfOff')}</Badge>}
              </div>
              <div className="divide-y divide-border/60">
                {items.map(({ def, value, source }) => (
                  <div key={`${def.module}.${def.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <div className="min-w-[200px] flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{def.label[locale]}</span>
                        {def.risk === 'sensitive' && (
                          <Badge variant="warning">{t('platform.company.c360.wfSensitive')}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{def.help[locale]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={source === 'company' ? 'info' : 'outline'}>
                        {source === 'company'
                          ? t('platform.company.c360.wfCustom')
                          : t('platform.company.c360.wfDefault')}
                      </Badge>
                      {renderValue(def, value)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">{t('platform.company.c360.wfFoundation')}</p>
    </div>
  );
}
