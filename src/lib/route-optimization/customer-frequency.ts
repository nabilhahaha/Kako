// ============================================================================
// Customer-level visit frequency — read path (FR-2). Pure, no I/O. Maps the
// customer master columns (FR-2 storage) into the FR-1 value model and composes
// the effective frequency via the FR-1 precedence resolver.
//
// Behaviour-preserving: nothing here writes, and nothing is wired into the
// journey-plan generator/apply yet (that is FR-5). When a customer has no
// `visit_frequency`, `customerLevelFrequency` returns null and the resolver
// falls straight through to the classification path — i.e. exactly today's
// behaviour.
// ============================================================================
import { parseFrequency, type VisitFrequency } from './visit-frequency';
import {
  resolveVisitFrequency,
  type ResolvedFrequency,
  type FrequencyResolveInput,
} from './frequency-resolver';

/** The customer-master frequency columns this layer reads (FR-2). */
export interface CustomerFrequencyFields {
  visit_frequency: string | null;
  visit_frequency_source?: 'manual' | 'import' | 'classification' | 'system' | null;
}

/** Customer-level candidate (level #1) parsed from the master columns, or null
 *  when unset/unparseable. Provenance defaults to 'manual'. Pure. */
export function customerLevelFrequency(
  row: CustomerFrequencyFields,
): { frequency: VisitFrequency; source: 'manual' | 'import' } | null {
  const frequency = parseFrequency(row.visit_frequency);
  if (!frequency) return null;
  const source = row.visit_frequency_source === 'import' ? 'import' : 'manual';
  return { frequency, source };
}

/**
 * Compose the effective visit frequency for one customer through the FR-1
 * resolver: customer-level (#1) → planning (#2) → classification (#3) →
 * system (#4), honouring the company override policy. Pure.
 */
export function effectiveCustomerFrequency(input: {
  customerRow: CustomerFrequencyFields;
  planning?: VisitFrequency | null;
  classification?: VisitFrequency | null;
  system?: VisitFrequency | null;
  classificationCanOverride?: boolean;
}): ResolvedFrequency {
  const customerLevel = customerLevelFrequency(input.customerRow);
  const args: FrequencyResolveInput = {
    customer: customerLevel?.frequency ?? null,
    customerSource: customerLevel?.source,
    planning: input.planning ?? null,
    classification: input.classification ?? null,
    system: input.system ?? null,
    policy: { classificationCanOverride: input.classificationCanOverride === true },
  };
  return resolveVisitFrequency(args);
}
