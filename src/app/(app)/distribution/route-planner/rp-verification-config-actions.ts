'use server';

// ============================================================================
// FV-4d — dropdown sources for the verification form. City/Channel options come from the
// company's ADMIN-MANAGED catalog (erp_rp_verification_catalog, active values only) — NOT
// from DISTINCT dataset values and never free-typed. Thin wrapper over getActiveCatalog so
// existing callers (rep form, admin panel) keep the same shape.
// ============================================================================

import { getActiveCatalog } from './rp-verification-catalog-actions';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

export async function getVerificationConfig(): Promise<ResultD<{ cities: string[]; channels: string[] }>> {
  return getActiveCatalog();
}
