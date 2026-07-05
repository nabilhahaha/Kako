import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarRange,
  Camera,
  MapPin,
  Repeat,
  Store,
  Sun,
} from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/stats/StatCard'
import { DailyBarChart, BreakdownBars } from '@/components/stats/BarChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Spinner'
import { useStats } from '@/hooks/queries'
import { VISIT_STATUS_META, VISIT_TYPE_META } from '@/lib/constants'
import { VISIT_STATUSES, VISIT_TYPES } from '@/types'

const statusColors: Record<string, string> = {
  excellent: 'bg-ios-green',
  good: 'bg-ios-blue',
  needs_follow_up: 'bg-ios-orange',
  urgent: 'bg-accent',
}

export function StatsPage() {
  const stats = useStats()

  if (stats.isLoading) {
    return (
      <Page title="Statistics">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[118px] rounded-card" />
          ))}
        </div>
      </Page>
    )
  }

  const data = stats.data
  if (!data) {
    return (
      <Page title="Statistics">
        <EmptyState
          icon={BarChart3}
          title="No statistics yet"
          message="Once you start logging visits, your numbers appear here."
        />
      </Page>
    )
  }

  const typeItems = VISIT_TYPES.map((type) => ({
    label: VISIT_TYPE_META[type].label,
    count: data.byType[type] ?? 0,
  }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)

  const statusItems = VISIT_STATUSES.map((status) => ({
    label: VISIT_STATUS_META[status].label,
    count: data.byStatus[status] ?? 0,
    color: statusColors[status],
  })).filter((item) => item.count > 0)

  return (
    <Page title="Statistics">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Today's Visits" value={data.today} icon={Sun} index={0} />
        <StatCard
          label="Weekly Visits"
          value={data.week}
          icon={CalendarDays}
          tint="text-ios-blue bg-ios-blue/12"
          index={1}
        />
        <StatCard
          label="Monthly Visits"
          value={data.month}
          icon={CalendarRange}
          tint="text-ios-purple bg-ios-purple/12"
          index={2}
        />
        <StatCard
          label="Total Customers"
          value={data.totalCustomers}
          icon={Store}
          tint="text-ios-teal bg-ios-teal/12"
          index={3}
        />
        <StatCard
          label="Total Visits"
          value={data.totalVisits}
          icon={MapPin}
          tint="text-ios-indigo bg-ios-indigo/12"
          index={4}
        />
        <StatCard
          label="Total Photos"
          value={data.totalPhotos}
          icon={Camera}
          tint="text-ios-pink bg-ios-pink/12"
          index={5}
        />
        <StatCard
          label="Follow-up Visits"
          value={data.followUp}
          icon={Repeat}
          tint="text-ios-orange bg-ios-orange/12"
          index={6}
        />
        <StatCard
          label="Urgent Visits"
          value={data.urgent}
          icon={AlertTriangle}
          index={7}
        />
      </div>

      <Card className="mb-4">
        <h3 className="mb-4 text-[16px] font-bold">Last 14 Days</h3>
        <DailyBarChart data={data.byDay} />
      </Card>

      {typeItems.length > 0 && (
        <Card className="mb-4">
          <h3 className="mb-4 text-[16px] font-bold">Visit Types · 14 days</h3>
          <BreakdownBars items={typeItems} />
        </Card>
      )}

      {statusItems.length > 0 && (
        <Card>
          <h3 className="mb-4 text-[16px] font-bold">Visit Status · 14 days</h3>
          <BreakdownBars items={statusItems} />
        </Card>
      )}
    </Page>
  )
}
