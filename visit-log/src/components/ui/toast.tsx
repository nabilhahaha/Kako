import { useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

let toasts: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function toast(message: string, kind: ToastKind = 'success') {
  const item: ToastItem = { id: nextId++, kind, message }
  toasts = [...toasts.slice(-2), item]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id)
    emit()
  }, 3200)
}

const icons: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

export function Toaster() {
  const items = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts,
  )

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-safe">
      <AnimatePresence>
        {items.map((item) => {
          const Icon = icons[item.kind]
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: -24, scale: 0.94 }}
              animate={{ opacity: 1, y: 8, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.94 }}
              transition={{ type: 'spring', damping: 28, stiffness: 420 }}
              className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-[14px] font-semibold text-bg shadow-card-lg"
            >
              <Icon
                size={17}
                className={cn(
                  item.kind === 'success' && 'text-ios-green',
                  item.kind === 'error' && 'text-accent-light',
                  item.kind === 'info' && 'text-ios-blue',
                )}
              />
              {item.message}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
