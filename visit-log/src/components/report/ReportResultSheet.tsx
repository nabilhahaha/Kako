import { useEffect, useRef, useState } from 'react'
import { Check, Download, Printer, Share2 } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { toast } from '@/components/ui/toast'
import { downloadBlob } from '@/lib/utils'
import type { ReportPdf } from '@/lib/report/pdf'

/** Post-generation actions for a report PDF: OS share sheet, save, print. */
export function ReportResultSheet({
  open,
  pdf,
  onClose,
  autoShare,
}: {
  open: boolean
  pdf: ReportPdf | null
  onClose: () => void
  /** When true, immediately opens the OS share sheet on mount. */
  autoShare?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const autoShared = useRef(false)

  const share = async () => {
    if (!pdf) return
    setBusy(true)
    try {
      const { shareReport } = await import('@/lib/report/share')
      const outcome = await shareReport(pdf)
      if (outcome === 'downloaded') toast('Sharing not supported here — saved the PDF instead', 'info')
    } finally {
      setBusy(false)
    }
  }

  // Requirement 11: "Share Report" from the post-save flow opens the sheet at once.
  useEffect(() => {
    if (open && autoShare && pdf && !autoShared.current) {
      autoShared.current = true
      const t = setTimeout(share, 250)
      return () => clearTimeout(t)
    }
    if (!open) autoShared.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoShare, pdf])

  const print = async () => {
    if (!pdf) return
    const { printReport } = await import('@/lib/report/share')
    printReport(pdf)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Report Ready">
      <div className="space-y-4 pt-1">
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ios-green/15 text-ios-green">
            <Check size={30} />
          </span>
          <p className="text-[16px] font-bold">Your report is ready</p>
          {pdf && <p className="mt-0.5 max-w-[280px] truncate text-[13px] text-ink-2">{pdf.filename}</p>}
        </div>

        <button
          onClick={share}
          disabled={busy || !pdf}
          className="press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-bold text-white shadow-fab disabled:opacity-50"
        >
          <Share2 size={19} />
          {busy ? 'Opening…' : 'Share Report'}
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => pdf && downloadBlob(pdf.blob, pdf.filename)}
            className="press flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-surface-2 text-[15px] font-semibold text-ink"
          >
            <Download size={17} />
            Save to Files
          </button>
          <button
            onClick={print}
            className="press flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-surface-2 text-[15px] font-semibold text-ink"
          >
            <Printer size={17} />
            Print
          </button>
        </div>
        <button
          onClick={onClose}
          className="press flex w-full items-center justify-center py-2 text-[15px] font-semibold text-ios-blue"
        >
          Done
        </button>
      </div>
    </Sheet>
  )
}
