import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FileDown,
  Loader2,
  FileSpreadsheet,
  FileText,
  MapPinned,
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
import { LoadMore } from '@/components/ui/LoadMore'
import { toast } from '@/components/ui/toast'
import { CustomerForm } from '@/components/customers/CustomerForm'
import { VisitCard, useVisitThumbs } from '@/components/visits/VisitCard'
import { StaticMap } from '@/components/map/StaticMap'
import { useCustomer, useVisits } from '@/hooks/queries'
import { useDeleteCustomer } from '@/hooks/mutations'
import { fetchAllVisits } from '@/lib/api'
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
  const { customer, isLoading } = useCustomer(id)
  const visits = useVisits({ customerId: id })
  const allVisits = visits.data?.pages.flatMap((page) => page.visits) ?? []
  const thumbs = useVisitThumbs(allVisits)
  const deleteCustomer = useDeleteCustomer()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  const runExport = async (kind: 'pdf' | 'excel' | 'csv', target: Customer) => {
    setExporting(kind)
    try {
      // Exporters (jspdf/xlsx) are heavy — loaded on demand only.
      const [history, exporters] = await Promise.all([
        fetchAllVisits({ customerId: target.id }),
        import('@/lib/export'),
      ])
      if (kind === 'pdf') exporters.exportCustomerHistoryPdf(target, history)
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
      <Card className="mb-4">
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

      {customer.latitude != null && customer.longitude != null && (
        <div className="mb-4">
          <StaticMap latitude={customer.latitude} longitude={customer.longitude} />
        </div>
      )}

      <Button
        size="lg"
        full
        className="mb-6"
        onClick={() => navigate(`/visits/new?customer=${customer.id}`)}
      >
        <Plus size={20} strokeWidth={2.4} />
        New Visit
      </Button>

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

      {visits.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-[100px] rounded-card" />
          <Skeleton className="h-[100px] rounded-card" />
        </div>
      ) : allVisits.length === 0 ? (
        <EmptyState
          icon={MapPinned}
          title="No visits yet"
          message={`Your visit timeline for ${customer.name} will appear here, newest first.`}
        />
      ) : (
        <div className="space-y-3">
          {allVisits.map((visit, index) => (
            <VisitCard
              key={visit.id}
              visit={visit}
              index={index}
              hideCustomer
              thumbUrl={visit.photos[0] ? thumbs[visit.photos[0].storage_path] : undefined}
            />
          ))}
          <LoadMore
            hasMore={!!visits.hasNextPage}
            loading={visits.isFetchingNextPage}
            onMore={() => visits.fetchNextPage()}
          />
        </div>
      )}

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
