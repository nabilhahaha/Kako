import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  subDays,
  subWeeks,
  subMonths,
  format,
} from 'date-fns'
import { fetchCustomers, fetchReportVisits } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { storefrontOf, type StorefrontRef } from '@/lib/storefront'
import { categoryLabel, distributorLabel } from '@/lib/constants'
import type { Customer, VisitStatus, VisitType, VisitWithMeta } from '@/types'

export type ReportType =
  | 'single_visit'
  | 'single_customer'
  | 'selected_customers'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'custom'

export interface ReportScope {
  type: ReportType
  visitId?: string
  customerIds?: string[]
  from?: string // ISO, for custom
  to?: string // ISO, for custom
}

export interface ReportCustomerSection {
  customer: Customer
  visits: VisitWithMeta[]
  storefront: StorefrontRef | null
  totalVisits: number
  firstVisit: string | null
  lastVisit: string | null
  avgFrequencyDays: number | null
  latestStatus: VisitStatus | null
  followUpNeeded: boolean
}

export interface ReportData {
  scope: ReportScope
  periodLabel: string
  reportId: string
  generatedAt: string
  userName: string
  customers: ReportCustomerSection[]
  totals: {
    customers: number
    visits: number
    photos: number
    gpsVerified: number
  }
  statusBreakdown: Record<string, number>
  typeBreakdown: Record<string, number>
  categoryBreakdown: Record<string, number>
  distributorBreakdown: Record<string, number>
  roshenAvailable: { yes: number; no: number }
  cityBreakdown: Record<string, number>
  avgVisitsPerCustomer: number
  avgPhotosPerVisit: number
  latestVisit: string | null
  oldestVisit: string | null
}

/** Resolves a scope to a concrete visit query window plus a human label. */
export function resolveWindow(scope: ReportScope, now = new Date()): {
  from?: string
  to?: string
  label: string
} {
  const iso = (d: Date) => d.toISOString()
  const day = (d: Date) => format(d, 'd MMM yyyy')
  switch (scope.type) {
    case 'today':
      return { from: iso(startOfDay(now)), to: iso(endOfDay(now)), label: `Today · ${day(now)}` }
    case 'yesterday': {
      const y = subDays(now, 1)
      return { from: iso(startOfDay(y)), to: iso(endOfDay(y)), label: `Yesterday · ${day(y)}` }
    }
    case 'this_week': {
      const s = startOfWeek(now, { weekStartsOn: 1 })
      const e = endOfWeek(now, { weekStartsOn: 1 })
      return { from: iso(s), to: iso(e), label: `This Week · ${day(s)} – ${day(e)}` }
    }
    case 'last_week': {
      const ref = subWeeks(now, 1)
      const s = startOfWeek(ref, { weekStartsOn: 1 })
      const e = endOfWeek(ref, { weekStartsOn: 1 })
      return { from: iso(s), to: iso(e), label: `Last Week · ${day(s)} – ${day(e)}` }
    }
    case 'this_month': {
      const s = startOfMonth(now)
      const e = endOfMonth(now)
      return { from: iso(s), to: iso(e), label: `This Month · ${format(now, 'MMMM yyyy')}` }
    }
    case 'last_month': {
      const ref = subMonths(now, 1)
      const s = startOfMonth(ref)
      const e = endOfMonth(ref)
      return { from: iso(s), to: iso(e), label: `Last Month · ${format(ref, 'MMMM yyyy')}` }
    }
    case 'custom': {
      const s = scope.from ? new Date(scope.from) : startOfMonth(now)
      const e = scope.to ? new Date(scope.to) : now
      return {
        from: iso(startOfDay(s)),
        to: iso(endOfDay(e)),
        label: `${day(s)} – ${day(e)}`,
      }
    }
    case 'single_visit':
      return { label: 'Single Visit' }
    case 'single_customer':
      return { label: 'Customer Report' }
    case 'selected_customers':
      return { label: 'Selected Customers' }
  }
}

function reportId(now: Date): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
  return `RPT-${format(now, 'yyyyMMdd')}-${rand}`
}

function galleryCount(visit: VisitWithMeta): number {
  return visit.photos.length
}

function hasRealStorefront(visit: VisitWithMeta): boolean {
  return !!visit.storefront_photo_url
}

/** Assembles a complete, aggregated report for a scope. */
export async function buildReport(
  scope: ReportScope,
  now = new Date(),
  scopeUserId?: string,
): Promise<ReportData> {
  const window = resolveWindow(scope, now)

  const customerIds =
    scope.type === 'single_customer'
      ? scope.customerIds
      : scope.type === 'selected_customers'
        ? scope.customerIds
        : undefined

  const [visits, allCustomers, session] = await Promise.all([
    fetchReportVisits({
      visitId: scope.type === 'single_visit' ? scope.visitId : undefined,
      customerIds,
      from: window.from,
      to: window.to,
      scopeUserId,
    }),
    fetchCustomers(scopeUserId),
    supabase.auth.getSession(),
  ])

  const customerById = new Map(allCustomers.map((c) => [c.id, c]))
  const userName = session.data.session?.user.email ?? 'Roshen Visit Log'

  // Group visits by customer (newest first within each).
  const byCustomer = new Map<string, VisitWithMeta[]>()
  for (const visit of visits) {
    const list = byCustomer.get(visit.customer_id) ?? []
    list.push(visit)
    byCustomer.set(visit.customer_id, list)
  }

  // For customer-scoped reports, include selected customers even with no visits.
  const includedIds = new Set<string>(byCustomer.keys())
  if (customerIds) customerIds.forEach((id) => includedIds.add(id))

  const sections: ReportCustomerSection[] = []
  for (const id of includedIds) {
    const customer = customerById.get(id)
    if (!customer) continue
    const cv = (byCustomer.get(id) ?? []).sort((a, b) => b.visited_at.localeCompare(a.visited_at))
    const dates = cv.map((v) => v.visited_at).sort()
    const first = dates[0] ?? null
    const last = dates[dates.length - 1] ?? null
    let avgFreq: number | null = null
    if (dates.length > 1 && first && last) {
      const span = new Date(last).getTime() - new Date(first).getTime()
      avgFreq = span / (dates.length - 1) / (24 * 60 * 60 * 1000)
    }
    sections.push({
      customer,
      visits: cv,
      storefront: cv[0] ? storefrontOf(cv[0]) : null,
      totalVisits: cv.length,
      firstVisit: first,
      lastVisit: last,
      avgFrequencyDays: avgFreq,
      latestStatus: cv[0]?.status ?? null,
      followUpNeeded: cv.some((v) => v.status === 'needs_follow_up' || v.status === 'urgent'),
    })
  }
  sections.sort((a, b) => a.customer.name.localeCompare(b.customer.name))

  // Aggregates
  const statusBreakdown: Record<string, number> = {}
  const typeBreakdown: Record<string, number> = {}
  const categoryBreakdown: Record<string, number> = {}
  const distributorBreakdown: Record<string, number> = {}
  const roshenAvailable = { yes: 0, no: 0 }
  const cityBreakdown: Record<string, number> = {}
  let totalPhotos = 0
  let gpsVerified = 0
  const allDates: string[] = []

  for (const visit of visits) {
    const status = visit.status as VisitStatus
    const type = visit.visit_type as VisitType
    statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1
    typeBreakdown[type] = (typeBreakdown[type] ?? 0) + 1
    totalPhotos += galleryCount(visit) + (hasRealStorefront(visit) ? 1 : 0)
    if (visit.latitude != null && visit.longitude != null) gpsVerified += 1
    allDates.push(visit.visited_at)
  }
  for (const section of sections) {
    const cat = categoryLabel(section.customer)
    categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1
    const dist = distributorLabel(section.customer.distributor)
    distributorBreakdown[dist] = (distributorBreakdown[dist] ?? 0) + 1
    if (section.customer.roshen_available) roshenAvailable.yes += 1
    else roshenAvailable.no += 1
    const city = section.customer.city?.trim() || 'Unknown'
    cityBreakdown[city] = (cityBreakdown[city] ?? 0) + 1
  }

  allDates.sort()
  const totalCustomers = sections.length
  const totalVisits = visits.length

  return {
    scope,
    periodLabel: window.label,
    reportId: reportId(now),
    generatedAt: now.toISOString(),
    userName,
    customers: sections,
    totals: { customers: totalCustomers, visits: totalVisits, photos: totalPhotos, gpsVerified },
    statusBreakdown,
    typeBreakdown,
    categoryBreakdown,
    distributorBreakdown,
    roshenAvailable,
    cityBreakdown,
    avgVisitsPerCustomer: totalCustomers ? totalVisits / totalCustomers : 0,
    avgPhotosPerVisit: totalVisits ? totalPhotos / totalVisits : 0,
    latestVisit: allDates[allDates.length - 1] ?? null,
    oldestVisit: allDates[0] ?? null,
  }
}
