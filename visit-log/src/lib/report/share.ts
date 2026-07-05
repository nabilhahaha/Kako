import { downloadBlob } from '@/lib/utils'
import type { ReportPdf } from '@/lib/report/pdf'

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Opens the OS share sheet with the PDF via the Web Share API (Level 2, file
 * sharing) — reaching WhatsApp, Mail/Gmail/Outlook, Files, AirDrop, Print and
 * any installed app. Falls back to a direct download when file sharing isn't
 * supported (most desktop browsers).
 */
export async function shareReport(pdf: ReportPdf, title = 'Roshen Visit Report'): Promise<ShareOutcome> {
  const file = new File([pdf.blob], pdf.filename, { type: 'application/pdf' })

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    'canShare' in navigator &&
    navigator.canShare?.({ files: [file] })

  if (canShareFiles && 'share' in navigator) {
    try {
      await navigator.share({ files: [file], title, text: title })
      return 'shared'
    } catch (error) {
      // User dismissed the sheet — not an error worth surfacing.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Otherwise fall through to download.
    }
  }

  downloadBlob(pdf.blob, pdf.filename)
  return 'downloaded'
}

/** Opens the browser print dialog for the generated PDF (Print destination). */
export function printReport(pdf: ReportPdf) {
  const url = URL.createObjectURL(pdf.blob)
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.src = url
  frame.onload = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      window.open(url, '_blank')
    }
  }
  document.body.appendChild(frame)
  setTimeout(() => {
    frame.remove()
    URL.revokeObjectURL(url)
  }, 60000)
}

export function fileShareSupported(): boolean {
  if (typeof navigator === 'undefined' || !('canShare' in navigator)) return false
  try {
    const probe = new File([new Blob(['x'])], 'probe.pdf', { type: 'application/pdf' })
    return !!navigator.canShare?.({ files: [probe] })
  } catch {
    return false
  }
}
