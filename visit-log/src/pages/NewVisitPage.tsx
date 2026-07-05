import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Calendar,
  ChevronRight,
  CloudUpload,
  LocateFixed,
  MapPinOff,
  Store,
} from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { OptionSheet } from '@/components/ui/OptionSheet'
import { toast } from '@/components/ui/toast'
import { CustomerPicker } from '@/components/customers/CustomerPicker'
import { CustomerForm } from '@/components/customers/CustomerForm'
import { PhotoPicker, releaseDraftPhotos, type DraftPhoto } from '@/components/visits/PhotoPicker'
import { NextCustomerSheet } from '@/components/visits/NextCustomerSheet'
import { CategoryBadge } from '@/components/customers/CategoryBadge'
import { useCustomers } from '@/hooks/queries'
import { useCreateVisit } from '@/hooks/mutations'
import { useGeolocation } from '@/hooks/useGeolocation'
import { MIN_PHOTOS, VISIT_STATUS_META, VISIT_TYPE_META } from '@/lib/constants'
import { cn, toLocalInputValue } from '@/lib/utils'
import { VISIT_STATUSES, VISIT_TYPES, type Customer, type VisitStatus, type VisitType } from '@/types'

export function Section({
  step,
  title,
  children,
}: {
  step: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
          {step}
        </span>
        <h3 className="text-[15px] font-bold">{title}</h3>
      </div>
      {children}
    </section>
  )
}

const typeOptions = VISIT_TYPES.map((type) => ({
  value: type,
  label: VISIT_TYPE_META[type].label,
  icon: VISIT_TYPE_META[type].icon,
}))

export function StatusGrid({
  value,
  onChange,
}: {
  value: VisitStatus
  onChange: (status: VisitStatus) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {VISIT_STATUSES.map((status) => {
        const meta = VISIT_STATUS_META[status]
        const active = status === value
        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(status)}
            className={cn(
              'press flex items-center gap-2 rounded-2xl border-2 px-3.5 py-3 text-left text-[14px] font-semibold transition-colors',
              active
                ? 'border-accent bg-accent-soft text-ink'
                : 'border-transparent bg-surface text-ink-2 shadow-card',
            )}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full', meta.dot)} />
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}

export function NewVisitPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const customersQuery = useCustomers()
  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data])
  const geo = useGeolocation()
  const createVisit = useCreateVisit()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [visitedAt, setVisitedAt] = useState(() => toLocalInputValue(new Date().toISOString()))
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const [visitType, setVisitType] = useState<VisitType>('general_visit')
  const [status, setStatus] = useState<VisitStatus>('good')
  const [notes, setNotes] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [nextOpen, setNextOpen] = useState(false)
  const [visitedIds, setVisitedIds] = useState<string[]>([])
  const savedVisitRef = useRef<string | null>(null)

  // Preselect the customer when arriving from a customer page.
  useEffect(() => {
    const preselected = params.get('customer')
    if (preselected && !customer && customers.length > 0) {
      const found = customers.find((c) => c.id === preselected)
      if (found) setCustomer(found)
    }
  }, [params, customers, customer])

  useEffect(() => () => releaseDraftPhotos(photos), []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!customer) {
      toast('Select a customer first', 'error')
      return
    }
    if (photos.length < MIN_PHOTOS) {
      toast('Add at least one photo', 'error')
      return
    }
    try {
      const result = await createVisit.mutateAsync({
        input: {
          customer_id: customer.id,
          visited_at: new Date(visitedAt).toISOString(),
          visit_type: visitType,
          status,
          notes: notes.trim() || null,
          latitude: geo.latitude,
          longitude: geo.longitude,
        },
        photos: photos.map((photo) => photo.blob),
      })
      releaseDraftPhotos(photos)
      savedVisitRef.current = result.status === 'saved' ? result.visitId : null
      setVisitedIds((ids) => (customer ? [...ids, customer.id] : ids))
      setPhotos([])
      toast(
        result.status === 'saved' ? 'Visit saved' : 'Saved offline — will sync automatically',
        result.status === 'saved' ? 'success' : 'info',
      )
      // Feature 9: offer the next nearest customer instead of leaving the flow.
      setNextOpen(true)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save visit', 'error')
    }
  }

  const startNextVisit = (customerId: string) => {
    const found = customers.find((c) => c.id === customerId)
    if (!found) return
    releaseDraftPhotos(photos)
    setCustomer(found)
    setPhotos([])
    setNotes('')
    setVisitType('general_visit')
    setStatus('good')
    setVisitedAt(toLocalInputValue(new Date().toISOString()))
    setNextOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const finishFlow = () => {
    setNextOpen(false)
    if (savedVisitRef.current) navigate(`/visits/${savedVisitRef.current}`, { replace: true })
    else navigate('/', { replace: true })
  }

  const TypeIcon = VISIT_TYPE_META[visitType].icon

  return (
    <Page title="New Visit" back="/">
      <div className="space-y-6">
        <Section step={1} title="Customer">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="press flex w-full items-center gap-3 rounded-card bg-surface p-4 text-left shadow-card"
          >
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                customer ? 'bg-accent text-white' : 'bg-accent-soft text-accent',
              )}
            >
              <Store size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-bold">
                {customer ? customer.name : 'Select customer'}
              </span>
              {customer ? (
                <span className="mt-0.5 flex items-center gap-1.5">
                  <CategoryBadge customer={customer} />
                  <span className="truncate text-[13px] text-ink-2">
                    {[customer.code, customer.city].filter(Boolean).join(' · ')}
                  </span>
                </span>
              ) : (
                <span className="block truncate text-[13px] text-ink-2">
                  Choose who you are visiting
                </span>
              )}
            </span>
            <ChevronRight size={18} className="text-ink-3" />
          </button>
        </Section>

        <Section step={2} title="Date & Time">
          <label className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-card">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ios-blue/12 text-ios-blue">
              <Calendar size={20} />
            </span>
            <input
              type="datetime-local"
              value={visitedAt}
              onChange={(event) => setVisitedAt(event.target.value)}
              className="flex-1 bg-transparent text-[16px] font-semibold outline-none"
            />
          </label>
        </Section>

        <Section step={3} title="Photos">
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </Section>

        <Section step={4} title="Visit Type">
          <button
            type="button"
            onClick={() => setTypeOpen(true)}
            className="press flex w-full items-center gap-3 rounded-card bg-surface p-4 text-left shadow-card"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ios-purple/12 text-ios-purple">
              <TypeIcon size={20} />
            </span>
            <span className="flex-1 text-[16px] font-bold">{VISIT_TYPE_META[visitType].label}</span>
            <ChevronRight size={18} className="text-ink-3" />
          </button>
        </Section>

        <Section step={5} title="Visit Status">
          <StatusGrid value={status} onChange={setStatus} />
        </Section>

        <Section step={6} title="Notes">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What did you see? Stock levels, display quality, competitor activity…"
            className="min-h-[140px] bg-surface shadow-card"
          />
        </Section>

        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl px-4 py-3 text-[13px] font-semibold',
            geo.status === 'granted' && 'bg-ios-green/10 text-ios-green',
            geo.status === 'locating' && 'bg-surface-2 text-ink-2',
            (geo.status === 'denied' || geo.status === 'unavailable') && 'bg-surface-2 text-ink-3',
          )}
        >
          {geo.status === 'granted' ? (
            <>
              <LocateFixed size={15} />
              Location captured — {geo.latitude?.toFixed(5)}, {geo.longitude?.toFixed(5)}
            </>
          ) : geo.status === 'locating' ? (
            <>
              <LocateFixed size={15} className="animate-pulse" />
              Getting your location…
            </>
          ) : (
            <>
              <MapPinOff size={15} />
              No location — visit will save without GPS
            </>
          )}
        </div>

        <Button size="lg" full loading={createVisit.isPending} onClick={save}>
          <CloudUpload size={20} />
          Save Visit
        </Button>
      </div>

      <CustomerPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        customers={customers}
        onSelect={setCustomer}
        onCreateNew={() => {
          setPickerOpen(false)
          setNewCustomerOpen(true)
        }}
      />
      <CustomerForm
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onSaved={setCustomer}
      />
      <OptionSheet
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        title="Visit Type"
        options={typeOptions}
        value={visitType}
        onSelect={(next) => next && setVisitType(next)}
      />
      <NextCustomerSheet
        open={nextOpen}
        onClose={finishFlow}
        excludeIds={visitedIds}
        onStartVisit={startNextVisit}
      />
    </Page>
  )
}
