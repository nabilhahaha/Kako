'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { requireAuth } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

export interface ReferenceItem {
  name: string;
  name_ar: string | null;
  detail: string | null;
  kind: string;
  price: number | null;
}

const DRUG_CSV_URL =
  'https://raw.githubusercontent.com/karem505/egyptian-drug-database/main/data/egyptian-drugs.csv';

/** Autocomplete search over the clinical reference (drugs / lab / radiology).
 *  Returns up to 15 matches; needs ≥2 chars. */
export async function searchClinicalReference(kinds: string[], q: string): Promise<ReferenceItem[]> {
  const { error } = await requireAuth();
  if (error) return [];
  // Strip characters that would break the PostgREST or-filter.
  const term = (q ?? '').replace(/[,()%*]/g, ' ').trim();
  if (term.length < 2) return [];

  const supabase = await createClient();
  const like = `%${term}%`;
  const { data } = await supabase
    .from('erp_clinic_reference')
    .select('name, name_ar, detail, kind, price')
    .in('kind', kinds)
    .eq('is_active', true)
    .or(`name.ilike.${like},name_ar.ilike.${like},detail.ilike.${like}`)
    .limit(15);
  return (data as ReferenceItem[]) ?? [];
}

/** Minimal RFC-4180 CSV parser (handles quoted fields). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Platform-owner only: (re)load the full Egyptian drug list from the open
 *  (CC0) Egyptian Drug Database into the clinical reference. Replaces the
 *  existing drug rows. */
export async function importEgyptianDrugs(): Promise<{ ok: boolean; error?: string; count?: number }> {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx?.isPlatformOwner) return { ok: false, error: t('clinic.refActions.platformOwnerOnly') };

  let rows: string[][];
  try {
    const res = await fetch(DRUG_CSV_URL, { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: t('clinic.refActions.drugLoadFailed') };
    rows = parseCsv(await res.text());
  } catch {
    return { ok: false, error: t('clinic.refActions.drugSourceUnavailable') };
  }

  const header = rows.shift();
  if (!header) return { ok: false, error: t('clinic.refActions.emptyFile') };
  const idx = (k: string) => header.indexOf(k);
  const iEn = idx('commercial_name_en');
  const iAr = idx('commercial_name_ar');
  const iSci = idx('scientific_name');
  const iMfr = idx('manufacturer');
  const iClass = idx('drug_class');
  const iRoute = idx('route');
  const iPrice = idx('price_egp');
  if (iEn < 0) return { ok: false, error: t('clinic.refActions.unexpectedFormat') };

  const cell = (r: string[], i: number, n: number) => (i >= 0 ? (r[i] ?? '').trim().slice(0, n) || null : null);
  const records = rows
    .filter((r) => (r[iEn] ?? '').trim().length > 0)
    .map((r) => {
      const sci = cell(r, iSci, 400);
      return {
        kind: 'drug' as const,
        name: (r[iEn] ?? '').trim().slice(0, 200),
        name_ar: cell(r, iAr, 200),
        // Richer Global Medicine Catalog fields (schema 0274). Active ingredient
        // and generic name both derive from the scientific name in this dataset.
        detail: sci,
        active_ingredient: sci,
        generic_name: sci,
        manufacturer: cell(r, iMfr, 200),
        category: cell(r, iClass, 120),
        form: cell(r, iRoute, 80),
        price: iPrice >= 0 && r[iPrice] && !Number.isNaN(Number(r[iPrice])) ? Number(r[iPrice]) : null,
      };
    });

  const supabase = await createClient();
  const { error: delErr } = await supabase.from('erp_clinic_reference').delete().eq('kind', 'drug');
  if (delErr) return { ok: false, error: delErr.message };

  const batchSize = 4000;
  let count = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const { error } = await supabase.from('erp_clinic_reference').insert(records.slice(i, i + batchSize));
    if (error) return { ok: false, error: error.message, count };
    count += Math.min(batchSize, records.length - i);
  }
  return { ok: true, count };
}

/** Current drug count (for the importer screen). */
export async function drugReferenceCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('erp_clinic_reference')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'drug');
  return count ?? 0;
}
