import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-8">
            <motion.div
              role="alertdialog"
              aria-modal="true"
              className="w-full max-w-[300px] overflow-hidden rounded-3xl bg-surface text-center shadow-card-lg"
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', damping: 26, stiffness: 420 }}
            >
              <div className="px-5 pb-4 pt-5">
                <h2 className="text-[17px] font-bold">{title}</h2>
                <p className="mt-1 text-[13px] leading-snug text-ink-2">{message}</p>
              </div>
              <div className="grid grid-cols-2 border-t border-separator">
                <button
                  onClick={onCancel}
                  disabled={loading}
                  className="h-12 border-r border-separator text-[17px] font-medium text-ios-blue active:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  disabled={loading}
                  className="h-12 text-[17px] font-semibold text-accent active:bg-surface-2 disabled:opacity-50"
                >
                  {loading ? '…' : confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
