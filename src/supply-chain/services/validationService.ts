/**
 * Validation service. Loads a snapshot, runs the Validation Engine, reconciles
 * findings with approved exceptions, and persists results. This is the seam
 * between the pure engine and storage.
 */
import type { Severity } from '../domain/enums';
import { SEVERITY_RANK } from '../domain/enums';
import type { ExceptionRecord, ValidationResult } from '../domain/models';
import { dataStore } from '../repositories';
import { runValidation } from '../validation/engine';
import type { ValidationContext } from '../validation/types';
import { recordAudit } from './auditService';
import { getConfig } from './configService';

export async function buildContext(now = new Date()): Promise<ValidationContext> {
  const [
    config,
    pis,
    piLines,
    deliveryNotes,
    deliveryNoteLines,
    invoices,
    invoiceLines,
  ] = await Promise.all([
    getConfig(),
    dataStore.pis.getAll(),
    dataStore.piLines.getAll(),
    dataStore.deliveryNotes.getAll(),
    dataStore.deliveryNoteLines.getAll(),
    dataStore.invoices.getAll(),
    dataStore.invoiceLines.getAll(),
  ]);
  return { now, config, pis, piLines, deliveryNotes, deliveryNoteLines, invoices, invoiceLines };
}

/** True effective severity of a result: a covered failure reads as an exception. */
export function effectiveSeverity(result: ValidationResult): Severity {
  if (result.coveredByExceptionId && (result.severity === 'fail')) return 'exception';
  return result.severity;
}

export function worstSeverity(results: ValidationResult[]): Severity {
  let worst: Severity = 'pass';
  for (const r of results) {
    const sev = effectiveSeverity(r);
    if (SEVERITY_RANK[sev] > SEVERITY_RANK[worst]) worst = sev;
  }
  return worst;
}

function isCovered(result: ValidationResult, ex: ExceptionRecord): boolean {
  if (ex.status !== 'approved') return false;
  if (ex.ruleCode !== result.ruleCode) return false;
  const piMatch =
    (ex.piId && ex.piId === result.piId) ||
    (ex.piNumber && ex.piNumber === result.piNumber);
  if (!piMatch) return false;
  if (ex.sku && ex.sku !== result.sku) return false;
  if (ex.deliveryNoteNumber && ex.deliveryNoteNumber !== result.deliveryNoteNumber) {
    return false;
  }
  return true;
}

/** Run the full validation engine and persist results. Returns the results. */
export async function runValidationAndPersist(now = new Date()): Promise<ValidationResult[]> {
  const ctx = await buildContext(now);
  const { results } = runValidation(ctx);

  const exceptions = await dataStore.exceptions.getAll();
  const approved = exceptions.filter((e) => e.status === 'approved');

  for (const result of results) {
    if (result.severity !== 'fail') continue;
    const cover = approved.find((ex) => isCovered(result, ex));
    if (cover) result.coveredByExceptionId = cover.id;
  }

  // Replace the previous result set wholesale.
  const previous = await dataStore.validationResults.getAll();
  await Promise.all(previous.map((r) => dataStore.validationResults.remove(r.id)));
  await dataStore.validationResults.saveMany(results);

  await recordAudit({
    action: 'VALIDATION_RUN',
    entityType: 'ValidationRun',
    summary: `Validation run produced ${results.length} results`,
    meta: {
      failures: results.filter((r) => effectiveSeverity(r) === 'fail').length,
      exceptions: results.filter((r) => effectiveSeverity(r) === 'exception').length,
      warnings: results.filter((r) => r.severity === 'warning').length,
    },
  });

  return results;
}

export async function listValidationResults(): Promise<ValidationResult[]> {
  return dataStore.validationResults.getAll();
}
