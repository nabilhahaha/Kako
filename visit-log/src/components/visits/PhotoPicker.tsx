import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from '@/components/ui/toast'
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
 * Camera/gallery capture with compression and previews. `reservedCount`
 * accounts for already-saved photos when editing, so the 20-photo cap holds
 * across both.
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
  const total = photos.length + reservedCount

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const room = MAX_PHOTOS - total
    const selected = Array.from(files).slice(0, room)
    if (files.length > room) {
      toast(`Maximum ${MAX_PHOTOS} photos per visit`, 'info')
    }
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
        capture="environment"
        multiple
        className="hidden"
        onChange={(event) => addFiles(event.target.files)}
      />
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        <AnimatePresence>
          {photos.map((photo) => (
            <motion.div
              key={photo.id}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="relative aspect-square"
            >
              <img
                src={photo.previewUrl}
                alt="Visit photo preview"
                className="h-full w-full rounded-2xl object-cover"
              />
              <button
                type="button"
                onClick={() => remove(photo.id)}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-bg shadow-card"
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {total < MAX_PHOTOS && (
          <motion.button
            layout
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-separator bg-surface-2/50 text-ink-2"
          >
            <Camera size={22} className={processing ? 'animate-pulse text-accent' : ''} />
            <span className="text-[11px] font-semibold">
              {processing ? 'Adding…' : 'Add'}
            </span>
          </motion.button>
        )}
      </div>
      <p className="mt-2 px-1 text-[12px] font-medium text-ink-3">
        {total} / {MAX_PHOTOS} photos
      </p>
    </div>
  )
}
