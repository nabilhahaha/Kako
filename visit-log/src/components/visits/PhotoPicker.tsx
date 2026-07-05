import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Reorder } from 'framer-motion'
import { toast } from '@/components/ui/toast'
import { Lightbox } from '@/components/photos/Lightbox'
import { compressImage } from '@/lib/image'
import { MAX_PHOTOS } from '@/lib/constants'

export interface DraftPhoto {
  id: string
  blob: Blob
  previewUrl: string
}

export function createDraftPhoto(blob: Blob): DraftPhoto {
  return { id: crypto.randomUUID(), blob, previewUrl: URL.createObjectURL(blob) }
}

export function releaseDraftPhotos(photos: DraftPhoto[]) {
  photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
}

/**
 * Optional visit gallery: multiple photos from camera or library, drag to
 * reorder, tap to preview fullscreen, delete individually. `reservedCount`
 * accounts for already-saved photos when editing, so the 20-photo cap holds.
 */
export function PhotoPicker({
  photos,
  onChange,
  reservedCount = 0,
}: {
  photos: DraftPhoto[]
  onChange: (photos: DraftPhoto[]) => void
  reservedCount?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)
  const total = photos.length + reservedCount

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const room = MAX_PHOTOS - total
    const selected = Array.from(files).slice(0, room)
    if (files.length > room) toast(`Maximum ${MAX_PHOTOS} photos per visit`, 'info')
    if (selected.length === 0) return
    setProcessing(true)
    try {
      const compressed = await Promise.all(selected.map((file) => compressImage(file)))
      onChange([...photos, ...compressed.map(createDraftPhoto)])
    } finally {
      setProcessing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = (id: string) => {
    const photo = photos.find((p) => p.id === id)
    if (photo) URL.revokeObjectURL(photo.previewUrl)
    onChange(photos.filter((p) => p.id !== id))
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => addFiles(event.target.files)}
      />
      <Reorder.Group
        as="div"
        axis="y"
        values={photos}
        onReorder={onChange}
        className="grid grid-cols-4 gap-2 sm:grid-cols-5"
      >
        {photos.map((photo, index) => (
          <Reorder.Item
            key={photo.id}
            value={photo}
            as="div"
            className="relative aspect-square cursor-grab touch-none active:cursor-grabbing"
            whileDrag={{ scale: 1.08, zIndex: 20 }}
          >
            <img
              src={photo.previewUrl}
              alt={`Visit photo ${index + 1}`}
              draggable={false}
              onClick={() => setPreview(index)}
              className="pointer-events-auto h-full w-full rounded-2xl object-cover"
            />
            <button
              type="button"
              onClick={() => remove(photo.id)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Remove photo"
              className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-bg shadow-card"
            >
              <X size={13} />
            </button>
          </Reorder.Item>
        ))}
        {total < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-separator bg-surface-2/50 text-ink-2"
          >
            <Camera size={22} className={processing ? 'animate-pulse text-accent' : ''} />
            <span className="text-[11px] font-semibold">{processing ? 'Adding…' : 'Add'}</span>
          </button>
        )}
      </Reorder.Group>
      <p className="mt-2 px-1 text-[12px] font-medium text-ink-3">
        {photos.length > 1 ? 'Drag to reorder · ' : ''}
        {total} / {MAX_PHOTOS} photos
      </p>

      {preview !== null && (
        <Lightbox
          photos={photos.map((p, i) => ({ id: p.id, url: p.previewUrl, caption: `Photo ${i + 1}` }))}
          index={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
