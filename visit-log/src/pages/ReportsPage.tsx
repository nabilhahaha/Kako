import { useMemo, useState } from 'react'
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  FileText,
  Loader2,
  Store,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Card } from '@/components/ui/Card'
import { toast } from '@/components/ui/toast'
import { ReportCustomerPicker } from '@/components/report/ReportCustomerPicker'
import { ReportResultSheet } from '@/components/report/ReportResultSheet'
import { useCustomers } from '@/hooks/queries'
import { cn } from '@/lib/utils'
import type { ReportType, ReportScope } from '@/lib/report/build'
import type { ReportPdf } from '@/lib/report/pdf'
import type { ReportProgress } from '@/lib/report'

type Option = { type: ReportType; label: string; hint: string; icon: LucideIcon }

const PERIOD_OPTIONS: Option[] = [
  { type: 'today', label: 'Today', hint: "Every visit logged today", icon: Sun },
  { type: 'yesterday', label: 'Yesterday', hint: "Yesterday's visits", icon: CalendarClock },
  { type: 'this_week', label: 'This Week', hint: 'Monday to Sunday', icon: CalendarDays },
  { type: 'last_week', label: 'Last Week', hint: 'The previous week', icon: CalendarDays },
  { type: 'this_month', label: 'This Month', hint: 'Current calendar month', icon: CalendarRange },
  { type: 'last_month', label: 'Last Month', hint: 'The previous month', icon: CalendarRange },
  { type: 'custom', label: 'Custom Range', hint: 'Pick your own dates', icon: CalendarRange },
]

const CUSTOMER_OPTIONS: Option[] = [
  { type: 'single_customer', label: 'Single Customer', hint: 'Full history for one customer', icon: Store },
  { type: 'selected_customers', label: 'Selected Customers', hint: 'Choose several customers', icon: Users },
]

function OptionRow({
  option,
  active,
  onClick,
}: {
  option: Option
  active: boolean
  onClick: () => void
}) {
  const Icon = option.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 border-b border-separator/60 px-1 py-3 text-left last:border-b-0 active:bg-surface-2',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
          active ? 'bg-accent text-white' : 'bg-accent-soft text-accent',
        )}
      >
        <Icon size={17} />
      </span>
      <span className="flex-1">
        <span className="block text-[15px] font-semibold">{option.label}</span>
        <span className="block text-[13px] text-ink-2">{option.hint}</span>
      </span>
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors',
          active ? 'border-accent bg-accent' : 'border-separator',
        )}
      >
        {active && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
    </button>
  )
}

export function ReportsPage() {
  const customersQuery = useCustomers()
  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data])

  const [type, setType] = useState<ReportType | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [customerIds, setCustomerIds] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ReportProgress | null>(null)
  const [pdf, setPdf] = useState<ReportPdf | null>(null)
  const [resultOpen, setResultOpen] = useState(false)

  const isCustomerType = type === 'single_customer' || type === 'selected_customers'
  const pickerMode: 'single' | 'multi' = type === 'single_customer' ? 'single' : 'multi'

  const chosenNames = customerIds
    .map((id) => customers.find((c) => c.id === id)?.name)
    .filter(Boolean) as string[]

  const selectType = (next: ReportType) => {
    setType(next)
    if (next === 'single_customer' || next === 'selected_customers') {
      setCustomerIds([])
      setPickerOpen(true)
    }
  }

  const buildScope = (): ReportScope | null => {
    if (!type) return null
    if (type === 'custom') {
      if (!from || !to) {
        toast('Choose both a start and end date', 'error')
        return null
      }
      if (from > to) {
        toast('Start date must be before the end date', 'error')
        return null
      }
      return { type, from: new Date(from).toISOString(), to: new Date(to).toISOString() }
    }
    if (isCustomerType) {
      if (customerIds.length === 0) {
        toast('Select at least one customer', 'error')
        return null
      }
      return { type, customerIds }
    }
    return { type }
  }

  const generate = async () => {
    const scope = buildScope()
    if (!scope) return
    setBusy(true)
    setProgress({ phase: 'Preparing', done: 0, total: 0 })
    try {
      const { generateReport } = await import('@/lib/report')
      const result = await generateReport(scope, setProgress)
      if (result.blob.size === 0) throw new Error('empty report')
      setPdf(result)
      setResultOpen(true)
    } catch (error) {
      console.error('[report] generate failed', error)
      toast(error instanceof Error && error.message !== 'empty report' ? error.message : 'Could not build the report', 'error')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const progressLabel = progress
    ? progress.total > 0
      ? `${progress.phase} · ${progress.done}/${progress.total}`
      : progress.phase
    : ''

  return (
    <Page title="Reports" back="/">
      <div className="mb-5 flex items-start gap-3 rounded-card bg-gradient-to-b from-accent-light/10 to-accent/5 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-fab">
          <FileText size={22} />
        </span>
        <div>
          <h2 className="text-[17px] font-bold">Professional Reports</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">
            Executive PDF reports with storefronts, photos and visit analytics — ready to share.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <h3 className="mb-1 px-1 text-[13px] font-bold uppercase tracking-wide text-ink-3">
            Time Period
          </h3>
          {PERIOD_OPTIONS.map((option) => (
            <OptionRow
              key={option.type}
              option={option}
              active={type === option.type}
              onClick={() => selectType(option.type)}
            />
          ))}

          {type === 'custom' && (
            <div className="mt-3 grid grid-cols-2 gap-2.5 px-1">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-ink-2">From</span>
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-11 rounded-2xl bg-surface-2 px-3 text-[15px] font-semibold outline-none focus:ring-4 focus:ring-accent/10"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-ink-2">To</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-11 rounded-2xl bg-surface-2 px-3 text-[15px] font-semibold outline-none focus:ring-4 focus:ring-accent/10"
                />
              </label>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-1 px-1 text-[13px] font-bold uppercase tracking-wide text-ink-3">
            By Customer
          </h3>
          {CUSTOMER_OPTIONS.map((option) => (
            <OptionRow
              key={option.type}
              option={option}
              active={type === option.type}
              onClick={() => selectType(option.type)}
            />
          ))}

          {isCustomerType && (
            <button
              onClick={() => setPickerOpen(true)}
              className="press mt-3 flex w-full items-center gap-2 rounded-2xl bg-surface-2 px-3.5 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                {chosenNames.length === 0 ? (
                  <span className="text-[14px] font-semibold text-ink-2">
                    Tap to choose {pickerMode === 'single' ? 'a customer' : 'customers'}
                  </span>
                ) : (
                  <span className="block truncate text-[14px] font-semibold text-ink">
                    {chosenNames.length <= 2
                      ? chosenNames.join(', ')
                      : `${chosenNames.slice(0, 2).join(', ')} +${chosenNames.length - 2} more`}
                  </span>
                )}
              </span>
              <ChevronRight size={17} className="text-ink-3" />
            </button>
          )}
        </Card>
      </div>

      <button
        onClick={generate}
        disabled={!type || busy}
        className="press mt-6 flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-bold text-white shadow-fab disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            {progressLabel || 'Building report…'}
          </>
        ) : (
          <>
            <FileText size={20} />
            Generate Report
          </>
        )}
      </button>
      {busy && (
        <p className="mt-2 text-center text-[12px] text-ink-3">
          Large reports may take a moment while photos are prepared.
        </p>
      )}

      <ReportCustomerPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        customers={customers}
        mode={pickerMode}
        selected={customerIds}
        onChange={setCustomerIds}
      />

      <ReportResultSheet open={resultOpen} pdf={pdf} onClose={() => setResultOpen(false)} />
    </Page>
  )
}
