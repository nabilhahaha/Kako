/**
 * The Validation Engine. A thin, stateless orchestrator: it runs every
 * registered rule against a context and stamps the findings with persistence
 * metadata. It contains no business rules itself — those live in ./rules.
 */
import type { ValidationResult } from '../domain/models';
import { newId } from '../utils/ids';
import { VALIDATION_RULES } from './rules';
import type { ValidationContext, ValidationRule } from './types';

export interface ValidationRun {
  results: ValidationResult[];
  ranAt: string;
  ruleCount: number;
}

export function runValidation(
  ctx: ValidationContext,
  rules: ValidationRule[] = VALIDATION_RULES,
): ValidationRun {
  const ranAt = ctx.now.toISOString();
  const results: ValidationResult[] = [];

  for (const rule of rules) {
    let findings;
    try {
      findings = rule.run(ctx);
    } catch (err) {
      // A misbehaving rule must never take down the whole run.
      findings = [
        {
          ruleCode: rule.code,
          ruleName: rule.name,
          severity: 'warning' as const,
          scope: 'pi' as const,
          piId: null,
          piNumber: null,
          deliveryNoteNumber: null,
          invoiceNumber: null,
          sku: null,
          message: `Rule "${rule.name}" failed to execute: ${(err as Error).message}`,
          details: {},
        },
      ];
    }

    for (const f of findings) {
      results.push({
        ...f,
        id: newId('vr'),
        createdAt: ranAt,
        coveredByExceptionId: null,
      });
    }
  }

  return { results, ranAt, ruleCount: rules.length };
}

/** Describe all registered rules (for the Settings / documentation screens). */
export function describeRules() {
  return VALIDATION_RULES.map((r) => ({
    code: r.code,
    name: r.name,
    description: r.description,
    requiresExceptionOnFail: r.requiresExceptionOnFail,
  }));
}
