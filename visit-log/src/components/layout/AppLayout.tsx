import { Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, CloudUpload } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { TabBar } from '@/components/layout/TabBar'
import { PullToRefresh } from '@/components/layout/PullToRefresh'
import { useOnline, usePendingVisits } from '@/hooks/queries'

export function AppLayout() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const pending = usePendingVisits()
  const pendingCount = pending.data?.length ?? 0

  const hideTabBar = /^\/visits\/(new|[^/]+\/edit)/.test(location.pathname)

  return (
    <div className="min-h-dvh">
      <AnimatePresence>
        {(!online || pendingCount > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 pb-safe"
          >
            <span className="flex items-center gap-2 rounded-full bg-ink/90 px-4 py-2 text-[13px] font-semibold text-bg shadow-card-lg backdrop-blur">
              {online ? (
                <>
                  <CloudUpload size={15} className="text-ios-blue" />
                  Syncing {pendingCount} visit{pendingCount === 1 ? '' : 's'}…
                </>
              ) : (
                <>
                  <CloudOff size={15} className="text-ios-orange" />
                  Offline{pendingCount > 0 ? ` · ${pendingCount} visit${pendingCount === 1 ? '' : 's'} queued` : ' — changes will sync later'}
                </>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <PullToRefresh onRefresh={() => queryClient.invalidateQueries()}>
        <Outlet />
      </PullToRefresh>
      {!hideTabBar && <TabBar />}
    </div>
  )
}
