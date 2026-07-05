import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Sheet({
  open,
  onClose,
  title,
  children,
  tall,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Fixes the sheet at 92% of the viewport (for pickers with long lists). */
  tall?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-t-sheet bg-surface shadow-sheet',
              tall ? 'h-[92dvh]' : 'max-h-[92dvh]',
            )}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 380 }}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-separator" />
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
              <h2 className="text-[17px] font-bold">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="press flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-2"
              >
                <X className="h-4.5 w-4.5" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pb-safe">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
