import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Lazy image with skeleton shimmer while the signed URL resolves and loads. */
export function PhotoImg({
  url,
  alt,
  className,
  onClick,
}: {
  url: string | undefined
  alt: string
  className?: string
  onClick?: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <div
      className={cn('relative overflow-hidden bg-separator/50', className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {url && !failed && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-ink-3">
          <ImageOff size={20} />
        </div>
      )}
      {!loaded && !failed && <div className="absolute inset-0 animate-pulse bg-separator/60" />}
    </div>
  )
}
