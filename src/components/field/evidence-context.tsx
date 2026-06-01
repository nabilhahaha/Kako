'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { uploadEvidence } from '@/lib/erp/evidence-upload';

/** Provides an evidence uploader (browser → field-evidence bucket) to descendant
 *  form fields. Where absent (designer preview, generic forms), file fields fall
 *  back to storing the file name. */
export type EvidenceUploader = (file: File, entity?: string) => Promise<string>;

const EvidenceCtx = createContext<EvidenceUploader | null>(null);

export function EvidenceProvider({ companyId, children }: { companyId: string; children: ReactNode }) {
  const upload: EvidenceUploader = async (file, entity = 'fe_capture') => {
    const supabase = createClient();
    return uploadEvidence(supabase, companyId, file, entity);
  };
  return <EvidenceCtx.Provider value={upload}>{children}</EvidenceCtx.Provider>;
}

export function useEvidenceUploader(): EvidenceUploader | null {
  return useContext(EvidenceCtx);
}
