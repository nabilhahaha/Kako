import { useRef, useState } from 'react'
import { Camera, CheckCircle2, RefreshCw, Store } from 'lucide-react'
import { compressImage } from '@/lib/image'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

export interface DraftStorefront {
  blob: Blob
  previewUrl: string
  takenAt: string
}

export function createDraftStorefront(blob: Blob): DraftStorefront {
  return { blob, previewUrl: URL.createObjectURL(blob), takenAt: new Date().toISOString() }
}

/**
 * Required, single storefront photo with a large premium card. Tapping the card
 * (or the replace button) recaptures. Shows a "Captured" confirmation with the
 * capture time. Completely separate from the visit gallery.
 */
export function StorefrontPicker({
  value,
  existingUrl,
  onChange,
}: {
  value: DraftStorefront | null
  /** Signed URL of an already-saved storefront (edit mode) shown until replaced. */
  existingUrl?: string
  onChange: (next: DraftStorefront | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setProcessing(true)
    try {
      const blob = await compressImage(file)
      if (value) URL.revokeObjectURL(value.previewUrl)
      onChange(createDraftStorefront(blob))
    } finally {
      setProcessing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const preview = value?.previewUrl ?? existingUrl
  const hasPhoto = !!preview

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => pick(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={processing}
        className={cn(
          'press relative block w-full overflow-hidden rounded-card text-left',
          hasPhoto ? 'aspect-[4/3] shadow-card-lg' : 'aspect-[4/3] border-2 border-dashed border-separator bg-surface-2/50',
        )}
      >
        {hasPhoto ? (
          <>
            <img src={preview} alt="Store front" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-white">
                  <CheckCircle2 size={17} className="text-ios-green" />
                  Captured
                  {value && (
                    <span className="font-medium text-white/80">· {formatTime(value.takenAt)}</span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur">
                  <RefreshCw size={13} />
                  Replace
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft">
              {processing ? (
                <Camera className="h-7 w-7 animate-pulse text-accent" />
              ) : (
                <Store className="h-7 w-7 text-accent" strokeWidth={1.8} />
              )}
            </span>
            <span className="text-[16px] font-bold text-ink">
              {processing ? 'Adding…' : 'Capture Store Front Photo'}
            </span>
            <span className="max-w-[220px] text-[13px] text-ink-2">
              A single photo of the customer&rsquo;s storefront. Required.
            </span>
          </div>
        )}
      </button>
    </div>
  )
}
