'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

/**
 * U2: one "Approvals" menu entry, with tabs to the three approval surfaces. The
 * Field queue is always shown; the Workflow inbox + Approval Center tabs appear
 * only for users who run the workflow engine (showWorkflow), so FMCG tenants see
 * a single clean view. Pure navigation — no behaviour change.
 */
export function ApprovalsTabs({ showWorkflow = false }: { showWorkflow?: boolean }) {
  const { t } = useI18n();
  const path = usePathname();
  const tabs = [
    { href: '/approvals/queue', label: t('approvalQueue.tabField') },
    ...(showWorkflow
      ? [
          { href: '/approvals', label: t('approvalQueue.tabWorkflow') },
          { href: '/approval-center', label: t('approvalQueue.tabCenter') },
        ]
      : []),
  ];
  if (tabs.length <= 1) return null;
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tb) => {
        const active = path === tb.href;
        return (
          <Link
            key={tb.href}
            href={tb.href}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
              active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tb.label}
          </Link>
        );
      })}
    </div>
  );
}
