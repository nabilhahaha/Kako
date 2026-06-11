'use client';

import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm-dialog';
import { usePrompt } from '@/components/prompt-dialog';
import { useI18n } from '@/lib/i18n/provider';
import { getCriticalActionSpec } from '@/lib/erp/critical-actions-catalog';

/**
 * VANTORA — Critical Action standard.
 *
 * One reusable pattern for every important/irreversible action across all
 * modules: confirm (with action name, affected record, user, timestamp and an
 * irreversible warning) → optional reason/comment → execute the server action →
 * success toast → optional "Print now?" prompt. Auditing is performed by the
 * server action itself (logAudit), so it is tamper-proof; the reason captured
 * here is passed through to be stored in the audit details.
 *
 * It COMPOSES the existing primitives (useConfirm, usePrompt) — it does not
 * replace them. Use `useCriticalAction()` for custom triggers, or drop in the
 * `<CriticalActionButton>` for the common button case.
 */

export interface CriticalResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
  /** A document/receipt/report URL to offer for printing after success. */
  printHref?: string;
}

export interface CriticalActionConfig<T = unknown> {
  /** Optional FMCG catalog key — supplies `irreversible` and reason defaults
   *  from CRITICAL_ACTIONS unless the call overrides them explicitly. */
  catalogKey?: string;
  /** Short, already-translated action name, e.g. "Close shift". */
  action: string;
  /** Affected record label, e.g. "Shift #3 — Cashier A". */
  record?: string;
  /** The user performing the action (display name/email). */
  user?: string;
  /** Irreversible → destructive styling + an explicit warning line. */
  irreversible?: boolean;
  /** Capture a reason/comment before executing (high-risk actions). */
  requireReason?: boolean;
  /** Suppress the generic success toast (for flows that show their own). */
  silentSuccess?: boolean;
  /** The server action to run; receives the optional reason for auditing. */
  execute: (reason?: string) => Promise<CriticalResult<T>>;
  /** Optional print URL to offer after success (or return result.printHref). */
  printHref?: (data?: T) => string | null | undefined;
  /** Runs after a successful action (e.g. router.refresh()). */
  onDone?: (data?: T) => void;
}

/** Returns `run(config)` — drives confirm → reason → execute → success → print. */
export function useCriticalAction() {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { t, locale } = useI18n();

  return useCallback(
    async function run<T>(cfg: CriticalActionConfig<T>): Promise<boolean> {
      // Catalog defaults (overridable per call): irreversible + reason policy.
      const spec = cfg.catalogKey ? getCriticalActionSpec(cfg.catalogKey) : undefined;
      const irreversible = cfg.irreversible ?? spec?.irreversible ?? false;
      const requireReason = cfg.requireReason ?? spec?.reasonRequired ?? false;

      const now = new Date().toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB');
      const details: { label: string; value: string }[] = [
        { label: t('critical.fieldAction'), value: cfg.action },
      ];
      if (cfg.record) details.push({ label: t('critical.fieldRecord'), value: cfg.record });
      if (cfg.user) details.push({ label: t('critical.fieldUser'), value: cfg.user });
      details.push({ label: t('critical.fieldTime'), value: now });

      const okConfirm = await confirm({
        title: t('critical.confirmTitle', { action: cfg.action }),
        details,
        warning: irreversible ? t('critical.irreversible') : undefined,
        destructive: irreversible,
        confirmText: t('shared.confirm'),
        cancelText: t('shared.cancel'),
      });
      if (!okConfirm) return false;

      let reason: string | undefined;
      if (requireReason) {
        const r = await prompt({
          title: t('critical.reasonTitle'),
          label: t('critical.reasonLabel'),
          placeholder: t('critical.reasonPlaceholder'),
          confirmText: t('shared.confirm'),
          cancelText: t('shared.cancel'),
        });
        if (r === null) return false; // cancelled the reason step
        reason = r.trim() || undefined;
      }

      const res = await cfg.execute(reason);
      if (!res.ok) {
        toast.error(res.error || t('shared.errorGeneric'));
        return false;
      }
      if (!cfg.silentSuccess) toast.success(t('critical.success', { action: cfg.action }));

      const href = cfg.printHref?.(res.data) ?? res.printHref;
      if (href) {
        const wantPrint = await confirm({
          title: t('critical.printTitle'),
          confirmText: t('critical.print'),
          cancelText: t('critical.skip'),
        });
        if (wantPrint) window.open(href, '_blank', 'noopener');
      }
      cfg.onDone?.(res.data);
      return true;
    },
    [confirm, prompt, t, locale],
  );
}

/** The common case: a button that runs a critical action when clicked. */
export function CriticalActionButton<T = unknown>({
  config,
  children,
  ...btn
}: { config: CriticalActionConfig<T> } & React.ComponentProps<typeof Button>) {
  const run = useCriticalAction();
  const [pending, setPending] = useState(false);
  return (
    <Button
      {...btn}
      disabled={btn.disabled || pending}
      onClick={async () => {
        setPending(true);
        try {
          await run(config);
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
    </Button>
  );
}
