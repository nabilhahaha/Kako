import { useEffect, useRef } from 'react'
import { Spinner } from '@/components/ui/Spinner'

/** Sentinel that lazily loads the next page when scrolled near. */
export function LoadMore({
  hasMore,
  loading,
  onMore,
}: {
  hasMore: boolean
  loading: boolean
  onMore: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasMore || loading) return
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onMore()
      },
      { rootMargin: '500px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loading, onMore])

  if (!hasMore && !loading) return null
  return <div ref={ref}>{loading && <Spinner className="py-6" />}</div>
}
