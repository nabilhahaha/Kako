import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LightboxPhoto {
  id: string
  url: string | undefined
  caption?: string
}

/** Fullscreen viewer with native swipe (scroll-snap) between photos. */
export function Lightbox({
  photos,
  index,
  onClose,
}: {
  photos: LightboxPhoto[]
  index: number
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(index)

  useEffect(() => {
    const node = containerRef.current
    if (node) node.scrollLeft = index * node.clientWidth
  }, [index])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') scrollTo(current + 1)
      if (event.key === 'ArrowLeft') scrollTo(current - 1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  })

  const scrollTo = (next: number) => {
    const node = containerRef.current
    if (!node) return
    const clamped = Math.max(0, Math.min(photos.length - 1, next))
    node.scrollTo({ left: clamped * node.clientWidth, behavior: 'smooth' })
  }

  const onScroll = () => {
    const node = containerRef.current
    if (!node) return
    setCurrent(Math.round(node.scrollLeft / node.clientWidth))
  }

  const caption = photos[current]?.caption

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] flex flex-col bg-black"
    >
      <div className="z-10 flex items-center justify-between px-4 pb-2 pt-safe">
        <span className="mt-3 rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold text-white">
          {current + 1} / {photos.length}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="press mt-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X size={19} />
        </button>
      </div>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="flex h-full w-full shrink-0 snap-center items-center justify-center p-2"
          >
            {photo.url ? (
              <img
                src={photo.url}
                alt={photo.caption ?? 'Visit photo'}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="h-64 w-full max-w-sm animate-pulse rounded-3xl bg-white/10" />
            )}
          </div>
        ))}
      </div>
      <div className="z-10 flex items-center justify-between px-4 pb-safe">
        <button
          onClick={() => scrollTo(current - 1)}
          aria-label="Previous photo"
          className={cn(
            'press mb-4 hidden h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white sm:flex',
            current === 0 && 'invisible',
          )}
        >
          <ChevronLeft size={20} />
        </button>
        {caption && (
          <p className="mb-4 flex-1 truncate px-3 text-center text-[13px] text-white/80">
            {caption}
          </p>
        )}
        <button
          onClick={() => scrollTo(current + 1)}
          aria-label="Next photo"
          className={cn(
            'press mb-4 hidden h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white sm:flex',
            current === photos.length - 1 && 'invisible',
          )}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </motion.div>,
    document.body,
  )
}
