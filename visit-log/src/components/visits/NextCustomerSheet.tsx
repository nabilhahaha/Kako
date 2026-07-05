import { useMemo, useState } from 'react'
import { CheckCircle2, FileText, Loader2, MapPin, Navigation, Plus, Share2, SkipForward } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { NavigateButton } from '@/components/nav/NavigateButton'
import { ReportResultSheet } from '@/components/report/ReportResultSheet'
import { toast } from '@/components/ui/toast'
import { useCustomers } from '@/hooks/queries'
import { useLocation } from '@/hooks/useLocation'
import { distanceMeters, formatDistance, formatDriveTime, hasCoords } from '@/lib/geo'
import type { ReportPdf } from '@/lib/report/pdf'

/**
 * Shown after a visit is saved. Confirms the save, offers a one-tap professional
 * report (generate or share) for the visit just logged, then suggests the
 * nearest remaining customer so the rep can chain visits without returning home.
 */
export function NextCustomerSheet({
  open,
  onClose,
  excludeIds,
  onStartVisit,
  savedVisitId,
}: {
  open: boolean
  onClose: () => void
  excludeIds: string[]
  onStartVisit: (customerId: string) => void
  /** The visit just saved — enables the single-visit report actions. */
  savedVisitId?: string | null
}) {
  const { location } = useLocation()
  const customers = useCustomers()
  const [index, setIndex] = useState(0)

  const [reportBusy, setReportBusy] = useState<'pdf' | 'share' | null>(null)
  const [pdf, setPdf] = useState<ReportPdf | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [autoShare, setAutoShare] = useState(false)

  const ranked = useMemo(() => {
    if (!location) return []
    const excluded = new Set(excludeIds)
    return (customers.data ?? [])
      .filter(hasCoords)
      .filter((c) => !excluded.has(c.id))
      .map((c) => ({ customer: c, meters: distanceMeters(location, c) }))
      .sort((a, b) => a.meters - b.meters)
  }, [customers.data, location, excludeIds])

  const current = ranked[index]

  const makeReport = async (share: boolean) => {
    if (!savedVisitId) return
    setReportBusy(share ? 'share' : 'pdf')
    try {
      const { generateReport } = await import('@/lib/report')
      const result = await generateReport({ type: 'single_visit', visitId: savedVisitId })
      if (result.blob.size === 0) throw new Error('empty report')
      setPdf(result)
      setAutoShare(share)
      setResultOpen(true)
    } catch {
      toast('Could not build the report', 'error')
    } finally {
      setReportBusy(null)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Visit Saved">
      <div className="space-y-5 pt-1">
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ios-green/15 text-ios-green">
            <CheckCircle2 size={30} />
          </span>
          <p className="text-[17px] font-bold">Visit Saved Successfully</p>
          <p className="mt-0.5 text-[14px] text-ink-2">Photos, notes and location are recorded.</p>
        </div>

        {savedVisitId && (
          <div className="space-y-2.5">
            <button
              onClick={() => makeReport(true)}
              disabled={reportBusy !== null}
              className="press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-bold text-white shadow-fab disabled:opacity-50"
            >
              {reportBusy === 'share' ? <Loader2 size={19} className="animate-spin" /> : <Share2 size={19} />}
              {reportBusy === 'share' ? 'Preparing…' : 'Share Report'}
            </button>
            <button
              onClick={() => makeReport(false)}
              disabled={reportBusy !== null}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[15px] font-semibold text-ink disabled:opacity-50"
            >
              {reportBusy === 'pdf' ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
              {reportBusy === 'pdf' ? 'Generating…' : 'Generate PDF'}
            </button>
          </div>
        )}

        {current && (
          <div className="border-t border-separator/60 pt-4">
            <p className="mb-2 px-1 text-[13px] font-bold text-ink-2">Next nearest customer</p>
            <div className="rounded-card bg-surface-2/70 p-4">
              <p className="text-[19px] font-bold">{current.customer.name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] font-medium text-ink-2">
                <span className="inline-flex items-center gap-1 text-accent">
                  <MapPin size={14} />
                  {formatDistance(current.meters)}
                </span>
                <span>~{formatDriveTime(current.meters)} drive</span>
                {(current.customer.area || current.customer.city) && (
                  <span>{current.customer.area || current.customer.city}</span>
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-2.5">
              <NavigateButton
                latitude={current.customer.latitude!}
                longitude={current.customer.longitude!}
                className="flex-1"
              />
              <button
                onClick={() => setIndex((i) => i + 1)}
                disabled={index >= ranked.length - 1}
                className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-surface-2 px-4 text-[15px] font-semibold text-ink disabled:opacity-40"
              >
                <SkipForward size={16} />
                Skip
              </button>
            </div>
            <Button size="lg" full className="mt-3" onClick={() => onStartVisit(current.customer.id)}>
              <Plus size={19} strokeWidth={2.4} />
              Start Next Visit
            </Button>
          </div>
        )}

        <button
          onClick={onClose}
          className="press flex w-full items-center justify-center gap-1.5 py-2 text-[15px] font-semibold text-ios-blue"
        >
          <Navigation size={15} className="rotate-90" />
          Done
        </button>
      </div>

      <ReportResultSheet
        open={resultOpen}
        pdf={pdf}
        autoShare={autoShare}
        onClose={() => setResultOpen(false)}
      />
    </Sheet>
  )
}
