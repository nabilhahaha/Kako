import type { ReportScope } from '@/lib/report/build'
import type { ReportPdf } from '@/lib/report/pdf'

export type ReportProgress = { phase: string; done: number; total: number }

/**
 * Builds the report data and renders the PDF. jsPDF and the report renderer are
 * dynamically imported so they stay out of the initial app bundle.
 */
export async function generateReport(
  scope: ReportScope,
  onProgress?: (p: ReportProgress) => void,
): Promise<ReportPdf> {
  onProgress?.({ phase: 'Collecting visits', done: 0, total: 0 })
  const [{ buildReport }, { generateReportPdf }] = await Promise.all([
    import('@/lib/report/build'),
    import('@/lib/report/pdf'),
  ])
  const data = await buildReport(scope)
  const pdf = await generateReportPdf(data, (phase, done, total) => onProgress?.({ phase, done, total }))
  return pdf
}
