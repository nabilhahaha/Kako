'use client';

import { FormFill, type FormSubmitResult } from '@/app/(app)/forms/form-fill';
import type { PreviewField } from '@/app/(app)/settings/forms/[id]/form-preview';
import { EvidenceProvider } from '@/components/field/evidence-context';
import { submitFieldCapture } from '../../capture-actions';
import type { CaptureKind } from '@/lib/erp/field-capture';

/** Field capture fill: the Builder runtime renderer with the capture submit
 *  injected and an evidence uploader in context (photos upload to storage). */
export function CaptureFill({ formId, fields, customerId, visitId, kind, companyId }: {
  formId: string; fields: PreviewField[]; customerId: string; visitId: string | null; kind: CaptureKind; companyId: string;
}) {
  async function submit(values: Record<string, unknown>): Promise<FormSubmitResult> {
    const r = await submitFieldCapture({ formId, customerId, visitId, kind, values });
    return { ok: r.ok, error: r.error, status: 'approved' };
  }
  return (
    <EvidenceProvider companyId={companyId}>
      <FormFill formId={formId} fields={fields} recordId={customerId} submit={submit} />
    </EvidenceProvider>
  );
}
