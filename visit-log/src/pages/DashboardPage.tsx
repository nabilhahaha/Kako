import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import {
  CalendarDays,
  CalendarRange,
  FileText,
  Plus,
  Search,
  Settings,
  Sun,
} from 'lucide-react'
import { Page, HeaderIconButton } from '@/components/layout/Page'
import { StatCard } from '@/components/stats/StatCard'
import { VisitCard, useVisitThumbs } from '@/components/visits/VisitCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Spinner'
import { useStats, useVisits } from '@/hooks/queries'
import { MapPin } from 'lucide-react'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const stats = useStats()
  const visits = useVisits()
  const latest = visits.data?.pages[0]?.visits ?? []
  const thumbs = useVisitThumbs(latest)

  return (
    <Page
      title="Visit Log"
      actions={
        <>
          <HeaderIconButton onClick={() => navigate('/search')} label="Search">
            <Search size={19} />
          </HeaderIconButton>
          <HeaderIconButton onClick={() => navigate('/reports')} label="Reports">
            <FileText size={19} />
          </HeaderIconButton>
          <HeaderIconButton onClick={() => navigate('/settings')} label="Settings">
            <Settings size={19} />
          </HeaderIconButton>
        </>
      }
    >
      <div className="mb-5">
        <h2 className="text-[26px] font-bold tracking-tight">{greeting()}</h2>
        <p className="text-[15px] text-ink-2">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {stats.isLoading ? (
          <>
            <Skeleton className="h-[118px] rounded-card" />
            <Skeleton className="h-[118px] rounded-card" />
            <Skeleton className="h-[118px] rounded-card" />
          </>
        ) : (
          <>
            <StatCard label="Today" value={stats.data?.today ?? 0} icon={Sun} index={0} />
            <StatCard
              label="This Week"
              value={stats.data?.week ?? 0}
              icon={CalendarDays}
              tint="text-ios-blue bg-ios-blue/12"
              index={1}
            />
            <StatCard
              label="This Month"
              value={stats.data?.month ?? 0}
              icon={CalendarRange}
              tint="text-ios-purple bg-ios-purple/12"
              index={2}
            />
          </>
        )}
      </div>

      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, type: 'spring', damping: 24, stiffness: 300 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => navigate('/visits/new')}
        className="mb-7 flex h-[58px] w-full items-center justify-center gap-2 rounded-card bg-gradient-to-b from-accent-light to-accent text-[17px] font-bold text-white shadow-fab"
      >
        <Plus size={22} strokeWidth={2.5} />
        New Visit
      </motion.button>

      <div className="mb-3 flex items-baseline justify-between px-1">
        <h3 className="text-[19px] font-bold">Latest Visits</h3>
        {latest.length > 0 && (
          <Link to="/stats" className="text-[14px] font-semibold text-accent">
            Statistics
          </Link>
        )}
      </div>

      {visits.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-[100px] rounded-card" />
          <Skeleton className="h-[100px] rounded-card" />
        </div>
      ) : latest.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No visits yet"
          message="Document your first customer visit — photos, notes and location in seconds."
        />
      ) : (
        <div className="space-y-3">
          {latest.slice(0, 5).map((visit, index) => (
            <VisitCard
              key={visit.id}
              visit={visit}
              index={index}
              thumbUrl={
                thumbs(visit.id)
              }
            />
          ))}
        </div>
      )}
    </Page>
  )
}
