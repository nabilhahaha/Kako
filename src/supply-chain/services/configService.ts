/**
 * Configuration service. The Validation Engine and upload validation read all
 * tunable business rules from here. Falls back to sane defaults on first run.
 */
import { DEFAULT_VALIDATION_CONFIG, type ValidationConfig } from '../domain/config';
import { dataStore } from '../repositories';
import { recordAudit } from './auditService';

export async function getConfig(): Promise<ValidationConfig> {
  const stored = await dataStore.config.get();
  // Merge so newly-added config keys get defaults without a migration.
  return { ...DEFAULT_VALIDATION_CONFIG, ...(stored ?? {}) };
}

export async function updateConfig(
  patch: Partial<ValidationConfig>,
): Promise<ValidationConfig> {
  const current = await getConfig();
  const next = { ...current, ...patch };
  await dataStore.config.set(next);
  await recordAudit({
    action: 'CONFIG_UPDATE',
    entityType: 'ValidationConfig',
    entityId: 'validation-config',
    summary: 'Validation configuration updated',
    meta: { patch },
  });
  return next;
}
