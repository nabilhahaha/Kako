import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { AskCopilot } from '@/components/copilot/ask-copilot';

// ─────────────────────────────────────────────────────────────────────────────
// "Ask Copilot" — the AI-optional prototype screen. Any authenticated user can
// ask a free-text question; the answer is produced by the deterministic engine
// (the AI layer is flag-gated server-side and OFF by default). No data is read
// by the AI layer; answers reflect the caller's own role and permissions.
// ─────────────────────────────────────────────────────────────────────────────

export default async function AskCopilotPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('copilot.askTitle')} description={t('copilot.askDescription')} />
      <AskCopilot />
    </div>
  );
}
