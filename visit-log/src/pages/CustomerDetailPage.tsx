import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  FileDown,
  Loader2,
  FileSpreadsheet,
  FileText,
  LocateFixed,
  MapPinned,
  Navigation2,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react'
import { Page, HeaderIconButton } from '@/components/layout/Page'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/toast'
import { CustomerForm } from '@/components/customers/CustomerForm'
import { CategoryBadge } from '@/components/customers/CategoryBadge'
import { NavigateButton } from '@/components/nav/NavigateButton'
import { CustomerTimeline } from '@/components/visits/CustomerTimeline'
import { GenerateReportButton } from '@/components/report/GenerateReportButton'
import { SalespersonFilter } from '@/components/admin/SalespersonFilter'
import { PhotoImg } from '@/components/photos/PhotoImg'
import { StaticMap } from '@/components/map/StaticMap'
import { useCustomer, useSignedUrls, useVisits } from '@/hooks/queries'
import { useDeleteCustomer } from '@/hooks/mutations'
import { useLocation } from '@/hooks/useLocation'
import { fetchAllVisits, fetchImageDataUrl } from '@/lib/api'
import { distributorLabel, roshenAvailableLabel } from '@/lib/constants'
import { storefrontOf } from '@/lib/storefront'
import { distanceMeters, formatDistance, formatDriveTime, hasCoords } from '@/lib/geo'
import { slugify } from '@/lib/utils'
import type { Customer } from '@/types'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-separator/60 py-2.5 text-[14px] last:border-b-0">
      <span className="shrink-0 font-medium text-ink-2">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  )
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { customer, isLoading } = useCustomer(id)
  const { location, status: locationStatus } = useLocation()
  const visits = useVisits({ customerId: id })
  const allVisits = visits.data?.pages.flatMap((page) => page.visits) ?? []
  // Cover = the newest visit's storefront (falls back to its first gallery photo).
  const cover = useMemo(() => (allVisits[0] ? storefrontOf(allVisits[0]) : null), [allVisits])
  const { data: coverUrls } = useSignedUrls(cover ? [cover.full] : [])
  const coverUrl = cover ? coverUrls?.[cover.full] : undefined
  const deleteCustomer = useDeleteCustomer()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  // Deep link from the map card ("Edit") opens the form directly.
  useEffect(() => {
    if (searchParams.get('edit') === '1' && customer) {
      setEditOpen(true)
      searchParams.delete('edit')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, customer, setSearchParams])

  const distance = useMemo(() => {
    if (!customer || !location || !hasCoords(customer)) return null
    return distanceMeters(location, customer)
  }, [customer, location])

  const runExport = async (kind: 'pdf' | 'excel' | 'csv', target: Customer) => {
    setExporting(kind)
    try {
      // Exporters (jspdf/xlsx) are heavy — loaded on demand only.
      const [history, exporters] = await Promise.all([
        fetchAllVisits({ customerId: target.id }),
        import('@/lib/export'),
      ])
      if (kind === 'pdf') {
        const sf = history[0] ? storefrontOf(history[0]) : null
        const hero = sf ? await fetchImageDataUrl(sf.full) : null
        exporters.exportCustomerHistoryPdf(target, history, hero)
      }
      if (kind === 'excel') exporters.exportVisitsExcel(history, `${slugify(target.name)}-visits`)
      if (kind === 'csv') exporters.exportVisitsCsv(history, `${slugify(target.name)}-visits`)
      toast('Export ready')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export failed', 'error')
    } finally {
      setExporting(null)
    }
  }

  const onDelete = async () => {
    if (!customer) return
    try {
      await deleteCustomer.mutateAsync(customer.id)
      toast('Customer deleted')
      navigate('/customers', { replace: true })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete customer', 'error')
      setConfirmDelete(false)
    }
  }

  if (isLoading) {
    return (
      <Page title="Customer" back="/customers">
        <Skeleton className="h-48 rounded-card" />
      </Page>
    )
  }

  if (!customer) {
    return (
      <Page title="Customer" back="/customers">
        <EmptyState
          icon={MapPinned}
          title="Customer not found"
          message="It may have been deleted."
        />
      </Page>
    )
  }

  return (
    <Page
      title={customer.name}
      back="/customers"
      actions={
        <>
          <HeaderIconButton onClick={() => setEditOpen(true)} label="Edit customer">
            <Pencil size={17} />
          </HeaderIconButton>
          <HeaderIconButton onClick={() => setConfirmDelete(true)} label="Delete customer">
            <Trash2 size={17} />
          </HeaderIconButton>
        </>
      }
    >
      {coverUrl && (
        <PhotoImg
          url={coverUrl}
          alt={`${customer.name} store front`}
          className="mb-4 aspect-[16/9] w-full rounded-card"
        />
      )}

      <Card className="mb-4">
        <div className="flex items-center justify-between gap-4 border-b border-separator/60 py-2.5 text-[14px]">
          <span className="shrink-0 font-medium text-ink-2">Category</span>
          <CategoryBadge customer={customer} size="md" />
        </div>
        <InfoRow label="Roshen Available" value={roshenAvailableLabel(customer.roshen_available)} />
        <InfoRow label="Distributor" value={distributorLabel(customer.distributor)} />
        {customer.code && <InfoRow label="Code" value={customer.code} />}
        {(customer.city || customer.area) && (
          <InfoRow
            label="Location"
            value={[customer.city, customer.area].filter(Boolean).join(' · ')}
          />
        )}
        {customer.address && <InfoRow label="Address" value={customer.address} />}
        {customer.phone && (
          <div className="flex items-center justify-between gap-4 border-b border-separator/60 py-2.5 text-[14px] last:border-b-0">
            <span className="font-medium text-ink-2">Phone</span>
            <a
              href={`tel:${customer.phone}`}
              className="inline-flex items-center gap-1.5 font-semibold text-accent"
            >
              <Phone size={14} />
              {customer.phone}
            </a>
          </div>
        )}
        {customer.notes && <InfoRow label="Notes" value={customer.notes} />}
        {!customer.code &&
          !customer.city &&
          !customer.area &&
          !customer.address &&
          !customer.phone &&
          !customer.notes && (
            <p className="py-2 text-center text-[14px] text-ink-3">No details yet — tap edit to add.</p>
          )}
      </Card>

      {hasCoords(customer) && (
        <Card className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ios-blue/12 text-ios-blue">
            <LocateFixed size={20} />
          </span>
          <div className="min-w-0 flex-1">
            {distance != null ? (
              <>
                <p className="text-[16px] font-bold">
                  {formatDistance(distance)}
                  <span className="ml-2 text-[14px] font-medium text-ink-2">
                    ~{formatDriveTime(distance)} drive
                  </span>
                </p>
                <p className="text-[12px] font-medium text-ink-3">
                  {locationStatus === 'granted' ? 'From your live location' : 'From last known location'}
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-ink-2">Distance unavailable</p>
                <p className="text-[12px] font-medium text-ink-3">
                  {locationStatus === 'denied'
                    ? 'Enable location to see distance'
                    : 'Getting your location…'}
                </p>
              </>
            )}
          </div>
          <Navigation2 size={18} className="shrink-0 text-ink-3" />
        </Card>
      )}

      {customer.latitude != null && customer.longitude != null && (
        <div className="mb-4">
          <StaticMap latitude={customer.latitude} longitude={customer.longitude} />
        </div>
      )}

      <div className="mb-6 flex gap-2.5">
        <Button
          size="lg"
          full
          onClick={() => navigate(`/visits/new?customer=${customer.id}`)}
        >
          <Plus size={20} strokeWidth={2.4} />
          New Visit
        </Button>
        {hasCoords(customer) && (
          <NavigateButton
            latitude={customer.latitude}
            longitude={customer.longitude}
            className="h-[52px] shrink-0 rounded-2xl px-5"
          />
        )}
      </div>

      <div className="mb-6">
        <GenerateReportButton
          scope={{ type: 'single_customer', customerIds: [customer.id] }}
          label="Professional Report"
        />
      </div>

      <SalespersonFilter />

      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-[19px] font-bold">Visit History</h3>
        <div className="flex gap-1">
          <HeaderIconButton
            onClick={() => runExport('pdf', customer)}
            label="Export PDF"
          >
            {exporting === 'pdf' ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
          </HeaderIconButton>
          <HeaderIconButton
            onClick={() => runExport('excel', customer)}
            label="Export Excel"
          >
            {exporting === 'excel' ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}
          </HeaderIconButton>
          <HeaderIconButton onClick={() => runExport('csv', customer)} label="Export CSV">
            {exporting === 'csv' ? <Loader2 size={17} className="animate-spin" /> : <FileDown size={17} />}
          </HeaderIconButton>
        </div>
      </div>

      <CustomerTimeline customer={customer} />

      <CustomerForm open={editOpen} onClose={() => setEditOpen(false)} customer={customer} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete customer?"
        message={`This permanently deletes ${customer.name} with all visits and photos.`}
        loading={deleteCustomer.isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Page>
  )
}
