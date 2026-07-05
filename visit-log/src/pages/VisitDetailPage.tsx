import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Camera, ChevronRight, FileQuestion, Pencil, Store, Trash2 } from 'lucide-react'
import { Page, HeaderIconButton } from '@/components/layout/Page'
import { Card } from '@/components/ui/Card'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/toast'
import { PhotoImg } from '@/components/photos/PhotoImg'
import { Lightbox } from '@/components/photos/Lightbox'
import { StaticMap } from '@/components/map/StaticMap'
import { NavigateButton } from '@/components/nav/NavigateButton'
import { useSignedUrls, useVisit } from '@/hooks/queries'
import { useDeleteVisit } from '@/hooks/mutations'
import { storefrontOf } from '@/lib/storefront'
import { formatDay, formatTime } from '@/lib/utils'

export function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const visit = useVisit(id)
  const deleteVisit = useDeleteVisit()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [storefrontOpen, setStorefrontOpen] = useState(false)

  const storefront = useMemo(() => (visit.data ? storefrontOf(visit.data) : null), [visit.data])
  // Only show the dedicated gallery here; a legacy visit's storefront fallback
  // photo is one of these gallery photos, which is fine to also list.
  const galleryPhotos = visit.data?.photos ?? []
  const paths = useMemo(() => {
    const list = galleryPhotos.map((photo) => photo.storage_path)
    if (storefront) list.push(storefront.full)
    return list
  }, [galleryPhotos, storefront])
  const { data: urls } = useSignedUrls(paths)

  const onDelete = async () => {
    if (!visit.data) return
    try {
      await deleteVisit.mutateAsync(visit.data)
      toast('Visit deleted')
      navigate(-1)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete visit', 'error')
      setConfirmDelete(false)
    }
  }

  if (visit.isLoading) {
    return (
      <Page title="Visit" back="/">
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      </Page>
    )
  }

  if (!visit.data) {
    return (
      <Page title="Visit" back="/">
        <EmptyState
          icon={FileQuestion}
          title="Visit not found"
          message="It may have been deleted."
        />
      </Page>
    )
  }

  const data = visit.data

  return (
    <Page
      title={data.customer?.name ?? 'Visit'}
      back="/"
      actions={
        <>
          <HeaderIconButton
            onClick={() => navigate(`/visits/${data.id}/edit`)}
            label="Edit visit"
          >
            <Pencil size={17} />
          </HeaderIconButton>
          <HeaderIconButton onClick={() => setConfirmDelete(true)} label="Delete visit">
            <Trash2 size={17} />
          </HeaderIconButton>
        </>
      }
    >
      <Card className="mb-4">
        {data.customer && (
          <Link
            to={`/customers/${data.customer.id}`}
            className="flex items-center justify-between border-b border-separator/60 pb-3"
          >
            <div>
              <p className="text-[18px] font-bold">{data.customer.name}</p>
              <p className="text-[13px] text-ink-2">
                {[data.customer.code, data.customer.city].filter(Boolean).join(' · ') ||
                  'View customer'}
              </p>
            </div>
            <ChevronRight size={18} className="text-ink-3" />
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <span className="mr-auto text-[14px] font-semibold text-ink-2">
            {formatDay(data.visited_at)} · {formatTime(data.visited_at)}
          </span>
          <TypeBadge type={data.visit_type} />
          <StatusBadge status={data.status} />
        </div>
      </Card>

      {storefront && (
        <>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Store size={16} className="text-ink-2" />
            <h3 className="text-[16px] font-bold">Store Front Photo</h3>
          </div>
          <PhotoImg
            url={urls?.[storefront.full]}
            alt="Store front"
            className="mb-5 aspect-[4/3] w-full cursor-pointer rounded-card"
            onClick={() => setStorefrontOpen(true)}
          />
        </>
      )}

      {galleryPhotos.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-2 px-1">
            <Camera size={16} className="text-ink-2" />
            <h3 className="text-[16px] font-bold">
              {galleryPhotos.length} Visit Photo{galleryPhotos.length === 1 ? '' : 's'}
            </h3>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {galleryPhotos.map((photo, index) => (
              <PhotoImg
                key={photo.id}
                url={urls?.[photo.storage_path]}
                alt={`Photo ${index + 1}`}
                className="aspect-square cursor-pointer rounded-2xl"
                onClick={() => setLightboxIndex(index)}
              />
            ))}
          </div>
        </>
      )}

      {data.notes && (
        <Card className="mb-4">
          <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-2">
            Notes
          </h3>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{data.notes}</p>
        </Card>
      )}

      {data.latitude != null && data.longitude != null && (
        <div className="space-y-3">
          <StaticMap latitude={data.latitude} longitude={data.longitude} />
          <NavigateButton latitude={data.latitude} longitude={data.longitude} className="w-full" />
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          photos={galleryPhotos.map((photo) => ({
            id: photo.id,
            url: urls?.[photo.storage_path],
            caption: `${data.customer?.name ?? 'Visit'} — ${formatDay(data.visited_at)}`,
          }))}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {storefrontOpen && storefront && (
        <Lightbox
          photos={[
            {
              id: 'storefront',
              url: urls?.[storefront.full],
              caption: `${data.customer?.name ?? 'Store front'} — Store Front Photo`,
            },
          ]}
          index={0}
          onClose={() => setStorefrontOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete visit?"
        message="This permanently deletes the visit and all its photos."
        loading={deleteVisit.isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Page>
  )
}
