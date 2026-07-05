import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { ReportResultSheet } from '@/components/report/ReportResultSheet'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { ReportScope } from '@/lib/report/build'
import type { ReportPdf } from '@/lib/report/pdf'

/**
 * Drop-in button that builds a professional PDF for a report scope and opens the
 * share/save result sheet. Used on the Visit and Customer detail pages.
 */
export function GenerateReportButton({
  scope,
  label = 'Professional Report',
  className,
}: {
  scope: ReportScope
  label?: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [pdf, setPdf] = useState<ReportPdf | null>(null)
  const [open, setOpen] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const { generateReport } = await import('@/lib/report')
      const result = await generateReport(scope)
      if (result.blob.size === 0) throw new Error('empty report')
      setPdf(result)
      setOpen(true)
    } catch {
      toast('Could not build the report', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={run}
        disabled={busy}
        className={cn(
          'press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[15px] font-semibold text-ink disabled:opacity-50',
          className,
        )}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} className="text-accent" />}
        {busy ? 'Building report…' : label}
      </button>
      <ReportResultSheet open={open} pdf={pdf} onClose={() => setOpen(false)} />
    </>
  )
}
