import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, CheckCircle2, ChevronRight, FileQuestion, X } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { OptionSheet } from '@/components/ui/OptionSheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import { PhotoImg } from '@/components/photos/PhotoImg'
import { PhotoPicker, releaseDraftPhotos, type DraftPhoto } from '@/components/visits/PhotoPicker'
import { StorefrontPicker, type DraftStorefront } from '@/components/visits/StorefrontPicker'
import { Section, StatusGrid } from '@/pages/NewVisitPage'
import { useSignedUrls, useVisit } from '@/hooks/queries'
import { useUpdateVisit } from '@/hooks/mutations'
import { VISIT_TYPE_META } from '@/lib/constants'
import { storefrontOf } from '@/lib/storefront'
import { toLocalInputValue } from '@/lib/utils'
import { VISIT_TYPES, type VisitStatus, type VisitType } from '@/types'

const typeOptions = VISIT_TYPES.map((type) => ({
  value: type,
  label: VISIT_TYPE_META[type].label,
  icon: VISIT_TYPE_META[type].icon,
}))

export function EditVisitPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const visit = useVisit(id)
  const updateVisit = useUpdateVisit()

  const [visitedAt, setVisitedAt] = useState('')
  const [visitType, setVisitType] = useState<VisitType>('general_visit')
  const [status, setStatus] = useState<VisitStatus>('good')
  const [notes, setNotes] = useState('')
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [newPhotos, setNewPhotos] = useState<DraftPhoto[]>([])
  const [newStorefront, setNewStorefront] = useState<DraftStorefront | null>(null)
  const [typeOpen, setTypeOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (visit.data && !initialized) {
      setVisitedAt(toLocalInputValue(visit.data.visited_at))
      setVisitType(visit.data.visit_type)
      setStatus(visit.data.status)
      setNotes(visit.data.notes ?? '')
      setInitialized(true)
    }
  }, [visit.data, initialized])

  useEffect(() => () => releaseDraftPhotos(newPhotos), []) // eslint-disable-line react-hooks/exhaustive-deps

  const storefront = useMemo(() => (visit.data ? storefrontOf(visit.data) : null), [visit.data])
  const paths = useMemo(() => {
    const list = visit.data?.photos.map((photo) => photo.storage_path) ?? []
    if (storefront) list.push(storefront.full)
    return list
  }, [visit.data, storefront])
  const { data: urls } = useSignedUrls(paths)

  if (visit.isLoading || !initialized) {
    if (!visit.isLoading && !visit.data) {
      return (
        <Page title="Edit Visit" back="/">
          <EmptyState icon={FileQuestion} title="Visit not found" message="It may have been deleted." />
        </Page>
      )
    }
    return (
      <Page title="Edit Visit" back="/">
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-card" />
          <Skeleton className="h-48 rounded-card" />
        </div>
      </Page>
    )
  }

  const data = visit.data!
  const keptPhotos = data.photos.filter((photo) => !removedIds.has(photo.id))

  const toggleRemove = (photoId: string) => {
    setRemovedIds((current) => {
      const next = new Set(current)
      if (next.has(photoId)) next.delete(photoId)
      else next.add(photoId)
      return next
    })
  }

  const save = async () => {
    try {
      // Only remove the previous storefront objects when they were real
      // storefront columns (not a backward-compat gallery fallback).
      const oldStorefrontPaths = [data.storefront_photo_url, data.storefront_thumbnail_url].filter(
        (p): p is string => !!p,
      )
      await updateVisit.mutateAsync({
        id: data.id,
        input: {
          customer_id: data.customer_id,
          visited_at: new Date(visitedAt).toISOString(),
          visit_type: visitType,
          status,
          notes: notes.trim() || null,
          latitude: data.latitude,
          longitude: data.longitude,
        },
        newPhotos: newPhotos.map((photo) => photo.blob),
        removedPhotos: data.photos.filter((photo) => removedIds.has(photo.id)),
        keptCount: keptPhotos.length,
        newStorefront: newStorefront ? { blob: newStorefront.blob, takenAt: newStorefront.takenAt } : null,
        oldStorefrontPaths,
      })
      releaseDraftPhotos(newPhotos)
      if (newStorefront) URL.revokeObjectURL(newStorefront.previewUrl)
      toast('Visit updated')
      navigate(`/visits/${data.id}`, { replace: true })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update visit', 'error')
    }
  }

  const TypeIcon = VISIT_TYPE_META[visitType].icon

  return (
    <Page title="Edit Visit" back={`/visits/${data.id}`}>
      <div className="space-y-6">
        <div className="rounded-card bg-surface p-4 shadow-card">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Customer</p>
          <p className="mt-0.5 text-[17px] font-bold">{data.customer?.name ?? '—'}</p>
        </div>

        <Section step={1} title="Date & Time">
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

        <Section step={2} title="Store Front Photo">
          <StorefrontPicker
            value={newStorefront}
            existingUrl={storefront ? urls?.[storefront.full] : undefined}
            onChange={setNewStorefront}
          />
        </Section>

        <Section step={3} title="Visit Photos">
          {keptPhotos.length + removedIds.size > 0 && (
            <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
              {data.photos.map((photo) => {
                const removed = removedIds.has(photo.id)
                return (
                  <div key={photo.id} className="relative aspect-square">
                    <PhotoImg
                      url={urls?.[photo.storage_path]}
                      alt="Saved photo"
                      className={`h-full w-full rounded-2xl ${removed ? 'opacity-35' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleRemove(photo.id)}
                      aria-label={removed ? 'Keep photo' : 'Remove photo'}
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-bg shadow-card"
                    >
                      {removed ? <CheckCircle2 size={13} /> : <X size={13} />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <PhotoPicker photos={newPhotos} onChange={setNewPhotos} reservedCount={keptPhotos.length} />
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
            placeholder="Visit notes…"
            className="min-h-[140px] bg-surface shadow-card"
          />
        </Section>

        <Button size="lg" full loading={updateVisit.isPending} onClick={save}>
          Save Changes
        </Button>
      </div>

      <OptionSheet
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        title="Visit Type"
        options={typeOptions}
        value={visitType}
        onSelect={(next) => next && setVisitType(next)}
      />
    </Page>
  )
}
