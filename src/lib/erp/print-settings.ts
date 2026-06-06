import type { SupabaseClient } from '@supabase/supabase-js';

export type ReceiptPaper = '80mm' | '58mm' | 'A4';

export interface PrintSettings {
  receipt_paper: ReceiptPaper;
  receipt_header: string | null;
  receipt_footer: string | null;
  show_logo: boolean;
  show_tax_number: boolean;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  receipt_paper: '80mm',
  receipt_header: null,
  receipt_footer: null,
  show_logo: true,
  show_tax_number: true,
};

/** Load the company's receipt/printer preferences (Settings → Printer Settings).
 *  Falls back to sensible defaults when none are saved. Used by the invoice /
 *  receipt print templates. */
export async function loadPrintSettings(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
): Promise<PrintSettings> {
  if (!companyId) return DEFAULT_PRINT_SETTINGS;
  const { data } = await supabase
    .from('erp_ops_settings')
    .select('receipt_paper, receipt_header, receipt_footer, show_logo, show_tax_number')
    .eq('company_id', companyId)
    .maybeSingle();
  if (!data) return DEFAULT_PRINT_SETTINGS;
  const d = data as Partial<PrintSettings>;
  return {
    receipt_paper: (d.receipt_paper as ReceiptPaper) ?? '80mm',
    receipt_header: d.receipt_header ?? null,
    receipt_footer: d.receipt_footer ?? null,
    show_logo: d.show_logo ?? true,
    show_tax_number: d.show_tax_number ?? true,
  };
}
