'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import type { AccessLevel } from '@/lib/erp/field-governance';
import { FormRenderer } from '@/components/forms/form-renderer';
import { enqueueFormResponse } from '@/lib/form-builder/offline-client';
import type { FormAnswers, FormDefinition } from '@/lib/form-builder';
import { submitFormResponse } from '../actions';

const FORM_CODE = 'customer_data_update';
const ENTITY = 'customer';

export function CustomerDataUpdateRunner({
  def,
  accessByGovKey,
}: {
  def: FormDefinition;
  accessByGovKey: Record<string, AccessLevel>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function onSubmit(answers: FormAnswers) {
    setBusy(true);
    try {
      // Offline-first: queue when there's no connection; the server applies it
      // EXACTLY-ONCE on sync via the same submitFormResponse path.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueueFormResponse({ formCode: FORM_CODE, answers, entity: ENTITY });
        toast.success(t('formBuilder.queuedOffline'));
        return;
      }
      const res = await submitFormResponse({ formCode: FORM_CODE, answers, entity: ENTITY });
      if (!res.ok) {
        toast.error(res.problems?.length ? res.problems.join(' · ') : t('formBuilder.error'));
        return;
      }
      toast.success(t('formBuilder.submitted'));
    } catch {
      toast.error(t('formBuilder.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <FormRenderer
          def={def}
          accessByGovKey={accessByGovKey}
          submitting={busy}
          submitLabel={busy ? t('formBuilder.submitting') : t('formBuilder.submit')}
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  );
}
