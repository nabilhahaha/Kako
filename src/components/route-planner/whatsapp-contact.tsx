'use client';

import { MessageCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { formatWhatsAppNumber, renewWhatsAppNumber } from '@/lib/erp/route-planner-subscription';

/**
 * WhatsApp contact control: a green WhatsApp deep-link button, the support number shown
 * visibly (so desktop users without WhatsApp can read it), and a Copy action. Used by the
 * trial banner, login, welcome and admin.
 */
export function WhatsAppContact({ url, label, tone = 'solid' }: { url: string; label: string; tone?: 'solid' | 'outline' }) {
  const { t } = useI18n();
  const pretty = formatWhatsAppNumber();

  async function copy() {
    const value = `+${renewWhatsAppNumber()}`;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('routePlanner.copiedNumber'));
    } catch {
      toast.error(t('routePlanner.copyFailed'));
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm transition ${tone === 'solid' ? 'bg-[#25D366] text-white hover:brightness-95' : 'border border-[#25D366] text-[#16a34a] hover:bg-[#25D366]/10'}`}
      >
        <MessageCircle className="h-3.5 w-3.5" /> {label}
      </a>
      <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
        <span className="font-medium tabular-nums" dir="ltr">{pretty}</span>
        <button type="button" onClick={copy} title={t('routePlanner.copyNumber')} className="text-muted-foreground hover:text-foreground">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </span>
    </span>
  );
}
