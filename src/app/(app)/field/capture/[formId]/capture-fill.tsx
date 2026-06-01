'use client';

import { FormFill, type FormSubmitResult } from '@/app/(app)/forms/form-fill';
import type { PreviewField } from '@/app/(app)/settings/forms/[id]/form-preview';
import { submitFieldCapture } from '../../capture-actions';
import type { CaptureKind } from '@/lib/erp/field-capture';

/** Field capture fill: the Builder runtime renderer with the capture submit
 *  injected. Customer + visit are pre-filled (no picking). */
export function CaptureFill({ formId, fields, customerId, visitId, kind }: {
  formId: string; fields: PreviewField[]; customerId: string; visitId: string | null; kind: CaptureKind;
}) {
  async function submit(values: Record<string, unknown>): Promise<FormSubmitResult> {
    const r = await submitFieldCapture({ formId, customerId, visitId, kind, values });
    return { ok: r.ok, error: r.error, status: 'approved' };
  }
  return <FormFill formId={formId} fields={fields} recordId={customerId} submit={submit} />;
}
