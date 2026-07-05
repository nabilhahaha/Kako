import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Loader2 } from 'lucide-react'

const TRIGGER = 64

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>
  children: ReactNode
}) {
  const y = useMotionValue(0)
  const opacity = useTransform(y, [0, TRIGGER], [0, 1])
  const rotate = useTransform(y, [0, TRIGGER * 1.6], [0, 270])
  const startY = useRef<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const onTouchStart = (event: TouchEvent) => {
    if (window.scrollY <= 0 && !refreshing) startY.current = event.touches[0].clientY
    else startY.current = null
  }

  const onTouchMove = (event: TouchEvent) => {
    if (startY.current === null) return
    const delta = event.touches[0].clientY - startY.current
    if (delta > 0 && window.scrollY <= 0) {
      y.set(Math.min(110, delta * 0.42))
    } else if (delta <= 0) {
      y.set(0)
    }
  }

  const onTouchEnd = async () => {
    if (startY.current === null) return
    startY.current = null
    if (y.get() >= TRIGGER) {
      setRefreshing(true)
      animate(y, 52, { type: 'spring', damping: 30, stiffness: 300 })
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        animate(y, 0, { type: 'spring', damping: 28, stiffness: 260 })
      }
    } else {
      animate(y, 0, { type: 'spring', damping: 28, stiffness: 260 })
    }
  }

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <motion.div
        style={{ opacity }}
        className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center pt-safe"
      >
        <motion.span
          style={{ rotate }}
          className="mt-16 flex h-9 w-9 items-center justify-center rounded-full bg-surface shadow-card"
        >
          <Loader2
            size={19}
            className={refreshing ? 'animate-spin text-accent' : 'text-ink-2'}
          />
        </motion.span>
      </motion.div>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  )
}
