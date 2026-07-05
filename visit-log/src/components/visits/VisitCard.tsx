import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import { PhotoImg } from '@/components/photos/PhotoImg'
import { useSignedUrls } from '@/hooks/queries'
import { formatDay, formatTime } from '@/lib/utils'
import type { VisitWithMeta } from '@/types'

/** Signed thumbnail URL (first photo) for each visit in a list. */
export function useVisitThumbs(visits: VisitWithMeta[]) {
  const paths = useMemo(
    () => visits.map((v) => v.photos[0]?.storage_path).filter(Boolean) as string[],
    [visits],
  )
  const { data } = useSignedUrls(paths)
  return data ?? {}
}

export function VisitCard({
  visit,
  thumbUrl,
  hideCustomer,
  index = 0,
}: {
  visit: VisitWithMeta
  thumbUrl?: string
  hideCustomer?: boolean
  index?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.25 }}
    >
      <Link
        to={`/visits/${visit.id}`}
        className="press flex items-center gap-3.5 rounded-card bg-surface p-3.5 shadow-card"
      >
        <PhotoImg
          url={thumbUrl}
          alt={visit.customer?.name ?? 'Visit'}
          className="h-[68px] w-[68px] shrink-0 rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          {!hideCustomer && (
            <p className="truncate text-[16px] font-bold">{visit.customer?.name ?? 'Customer'}</p>
          )}
          <p className="mt-0.5 text-[13px] font-medium text-ink-2">
            {formatDay(visit.visited_at)} · {formatTime(visit.visited_at)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TypeBadge type={visit.visit_type} />
            <StatusBadge status={visit.status} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="flex items-center gap-1 text-[12px] font-semibold text-ink-3">
            <Camera size={13} />
            {visit.photos.length}
          </span>
          <ChevronRight size={17} className="text-ink-3" />
        </div>
      </Link>
    </motion.div>
  )
}
