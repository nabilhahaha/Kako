// ============================================================================
// Multi-Form Field Work — Forms Library helpers (pure, no I/O / no React).
//
// Builds the admin Forms Library list from raw erp_forms + erp_form_versions rows. The
// Field Verification form (code 'fv_verification') and the bound Customer-Data-Update form
// ('customer_data_update') are RESERVED — they have their own dedicated screens and must
// never appear as editable generic forms here, so they are filtered out of the list. The FV
// form is surfaced separately as a locked "Core form" card by the panel.
// ============================================================================

/** Form codes owned by dedicated flows — excluded from the generic Forms Library list. */
export const RESERVED_FORM_CODES = ['fv_verification', 'customer_data_update'] as const;

export function isReservedFormCode(code: string): boolean {
  return (RESERVED_FORM_CODES as readonly string[]).includes(code);
}

export type FormVersionStatus = 'draft' | 'published' | 'archived';

/** Raw erp_forms row (the columns the library reads). */
export interface FormRow {
  id: string;
  code: string;
  name_en: string | null;
  name_ar: string | null;
  is_active: boolean;
  created_at: string;
}

/** Raw erp_form_versions row (subset). */
export interface FormVersionRow {
  form_id: string;
  version: number;
  status: string;
}

/** One row in the admin Forms Library. */
export interface FormSummary {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  isActive: boolean;
  createdAt: string;
  /** Highest version number (any status), or 0 if none. */
  latestVersion: number;
  /** Status of the latest version, or null when the form has no version yet. */
  latestStatus: FormVersionStatus | null;
  /** Whether a published version exists. */
  hasPublished: boolean;
  /** A published form whose latest version is a newer draft (unpublished edits pending). */
  draftPending: boolean;
}

function asStatus(s: string): FormVersionStatus | null {
  return s === 'draft' || s === 'published' || s === 'archived' ? s : null;
}

/** Join forms with their versions into ordered summaries (newest form first).
 *  RESERVED-code forms are excluded. Pure — unit-tested. */
export function buildFormSummaries(forms: FormRow[], versions: FormVersionRow[]): FormSummary[] {
  const byForm = new Map<string, FormVersionRow[]>();
  for (const v of versions) {
    const arr = byForm.get(v.form_id) ?? [];
    arr.push(v);
    byForm.set(v.form_id, arr);
  }
  const out: FormSummary[] = [];
  for (const f of forms) {
    if (isReservedFormCode(f.code)) continue;
    const vs = (byForm.get(f.id) ?? []).slice().sort((a, b) => b.version - a.version);
    const latest = vs[0];
    const hasPublished = vs.some((v) => v.status === 'published');
    const latestStatus = latest ? asStatus(latest.status) : null;
    out.push({
      id: f.id,
      code: f.code,
      nameEn: f.name_en ?? '',
      nameAr: f.name_ar ?? '',
      isActive: f.is_active,
      createdAt: f.created_at,
      latestVersion: latest?.version ?? 0,
      latestStatus,
      hasPublished,
      // published form + the very latest version is a draft on top of it
      draftPending: hasPublished && latestStatus === 'draft',
    });
  }
  // Newest first (stable for equal timestamps).
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out;
}

/** Localized form name with fallback across locales then code. */
export function formName(f: { nameEn: string; nameAr: string; code: string }, locale: 'ar' | 'en'): string {
  const primary = locale === 'ar' ? f.nameAr : f.nameEn;
  const secondary = locale === 'ar' ? f.nameEn : f.nameAr;
  return (primary && primary.trim()) || (secondary && secondary.trim()) || f.code;
}
