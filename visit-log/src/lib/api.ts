import { supabase } from '@/lib/supabase'
import { STORAGE_BUCKET } from '@/lib/constants'
import { compressThumbnail } from '@/lib/image'
import { storefrontOf, type StorefrontRef } from '@/lib/storefront'
import type {
  Customer,
  CustomerInput,
  GalleryPhoto,
  Visit,
  VisitInput,
  VisitPhoto,
  VisitWithMeta,
} from '@/types'

export const VISIT_PAGE_SIZE = 30
export const GALLERY_PAGE_SIZE = 60

const VISIT_SELECT =
  '*, customer:customers(id,name,code,city,customer_category,custom_category,roshen_available,distributor), photos:visit_photos(id,visit_id,storage_path,position,type,created_at)'

function sortPhotos<T extends { photos: VisitPhoto[] }>(visit: T): T {
  visit.photos.sort((a, b) => a.position - b.position)
  return visit
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('You are signed out. Please sign in again.')
  return data.session.user.id
}

// ---------------------------------------------------------------- customers

export async function fetchCustomers(scopeUserId?: string): Promise<Customer[]> {
  let query = supabase.from('customers').select('*').order('name')
  // Admins may narrow to one salesperson; RLS already limits everyone else.
  if (scopeUserId) query = query.eq('owner_user_id', scopeUserId)
  const { data, error } = await query
  if (error) throw error
  return data as Customer[]
}

/** Roles/profiles — admins can read all; a salesperson sees only their own. */
export async function fetchProfiles(): Promise<
  { id: string; email: string | null; full_name: string | null; role: 'salesperson' | 'admin' }[]
> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .order('full_name')
  if (error) throw error
  return data as { id: string; email: string | null; full_name: string | null; role: 'salesperson' | 'admin' }[]
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const { data, error } = await supabase.from('customers').insert(input).select().single()
  if (error) throw error
  return data as Customer
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Customer
}

export async function deleteCustomer(id: string): Promise<void> {
  // Rows cascade, but storage objects must be removed explicitly.
  const { data: photos, error: photosError } = await supabase
    .from('visit_photos')
    .select('storage_path, visit:visits!inner(customer_id)')
    .eq('visit.customer_id', id)
  if (photosError) throw photosError
  await removeStorageObjects((photos ?? []).map((p) => p.storage_path as string))
  const { error } = await supabase.from('customers').delete().eq('id', id)
  if (error) throw error
}

export async function importCustomers(rows: CustomerInput[]): Promise<number> {
  const CHUNK = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error, count } = await supabase
      .from('customers')
      .insert(chunk, { count: 'exact' })
    if (error) throw error
    inserted += count ?? chunk.length
  }
  return inserted
}

// ------------------------------------------------------------------- visits

export interface VisitFilters {
  customerId?: string
  visitType?: string
  status?: string
  from?: string
  to?: string
  /** Chronological order. Defaults to newest-first when omitted. */
  sort?: 'newest' | 'oldest'
  /** Admin-only: narrow to a single salesperson's visits. */
  scopeUserId?: string
}

function applyVisitFilters(query: any, filters: VisitFilters): any {
  if (filters.customerId) query = query.eq('customer_id', filters.customerId)
  if (filters.visitType) query = query.eq('visit_type', filters.visitType)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.from) query = query.gte('visited_at', filters.from)
  if (filters.to) query = query.lte('visited_at', filters.to)
  if (filters.scopeUserId) query = query.eq('user_id', filters.scopeUserId)
  return query
}

export async function fetchVisits(
  filters: VisitFilters,
  page: number,
): Promise<{ visits: VisitWithMeta[]; hasMore: boolean }> {
  const from = page * VISIT_PAGE_SIZE
  let query = supabase
    .from('visits')
    .select(VISIT_SELECT)
    .order('visited_at', { ascending: filters.sort === 'oldest' })
    .range(from, from + VISIT_PAGE_SIZE - 1)
  query = applyVisitFilters(query, filters)
  const { data, error } = await query
  if (error) throw error
  const visits = (data as unknown as VisitWithMeta[]).map(sortPhotos)
  return { visits, hasMore: visits.length === VISIT_PAGE_SIZE }
}

export async function fetchVisit(id: string): Promise<VisitWithMeta> {
  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return sortPhotos(data as unknown as VisitWithMeta)
}

async function uploadVisitPhotos(
  userId: string,
  visitId: string,
  photos: Blob[],
  startPosition: number,
): Promise<void> {
  for (let i = 0; i < photos.length; i++) {
    const position = startPosition + i
    const path = `${userId}/${visitId}/${Date.now()}-${position}-${crypto.randomUUID().slice(0, 8)}.jpg`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, photos[i], { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw uploadError
    const { error: rowError } = await supabase
      .from('visit_photos')
      .insert({ visit_id: visitId, storage_path: path, position, type: 'visit' })
    if (rowError) throw rowError
  }
}

/** Uploads the storefront full image plus a small thumbnail; returns both paths. */
async function uploadStorefront(
  userId: string,
  visitId: string,
  storefront: Blob,
): Promise<{ full: string; thumb: string }> {
  const stamp = Date.now()
  const rid = crypto.randomUUID().slice(0, 8)
  const full = `${userId}/${visitId}/storefront-${stamp}-${rid}.jpg`
  const thumb = `${userId}/${visitId}/storefront-${stamp}-${rid}-thumb.jpg`
  const thumbnail = await compressThumbnail(storefront)
  const up1 = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(full, storefront, { contentType: 'image/jpeg', upsert: false })
  if (up1.error) throw up1.error
  const up2 = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(thumb, thumbnail, { contentType: 'image/jpeg', upsert: false })
  if (up2.error) {
    await removeStorageObjects([full])
    throw up2.error
  }
  return { full, thumb }
}

export interface StorefrontInput {
  blob: Blob
  takenAt: string
}

export async function createVisit(
  input: VisitInput,
  storefront: StorefrontInput,
  photos: Blob[],
): Promise<Visit> {
  const userId = await currentUserId()
  const { data, error } = await supabase.from('visits').insert(input).select().single()
  if (error) throw error
  const visit = data as Visit
  try {
    const sf = await uploadStorefront(userId, visit.id, storefront.blob)
    const { error: sfError } = await supabase
      .from('visits')
      .update({
        storefront_photo_url: sf.full,
        storefront_thumbnail_url: sf.thumb,
        storefront_taken_at: storefront.takenAt,
      })
      .eq('id', visit.id)
    if (sfError) throw sfError
    await uploadVisitPhotos(userId, visit.id, photos, 0)
  } catch (uploadError) {
    // Roll back so we never persist a half-uploaded visit — the caller queues
    // the whole thing in the offline outbox instead.
    await deleteVisitObjectsUnder(userId, visit.id)
    await supabase.from('visits').delete().eq('id', visit.id)
    throw uploadError
  }
  return { ...visit }
}

export async function updateVisit(
  id: string,
  input: VisitInput,
  options: {
    newPhotos: Blob[]
    removedPhotos: VisitPhoto[]
    keptCount: number
    newStorefront?: StorefrontInput | null
    oldStorefrontPaths?: string[]
  },
): Promise<void> {
  const userId = await currentUserId()
  const { error } = await supabase.from('visits').update(input).eq('id', id)
  if (error) throw error

  if (options.newStorefront) {
    const sf = await uploadStorefront(userId, id, options.newStorefront.blob)
    const { error: sfError } = await supabase
      .from('visits')
      .update({
        storefront_photo_url: sf.full,
        storefront_thumbnail_url: sf.thumb,
        storefront_taken_at: options.newStorefront.takenAt,
      })
      .eq('id', id)
    if (sfError) throw sfError
    if (options.oldStorefrontPaths?.length) await removeStorageObjects(options.oldStorefrontPaths)
  }

  if (options.removedPhotos.length > 0) {
    const ids = options.removedPhotos.map((p) => p.id)
    const { error: deleteError } = await supabase.from('visit_photos').delete().in('id', ids)
    if (deleteError) throw deleteError
    await removeStorageObjects(options.removedPhotos.map((p) => p.storage_path))
  }
  if (options.newPhotos.length > 0) {
    await uploadVisitPhotos(userId, id, options.newPhotos, options.keptCount)
  }
}

export async function deleteVisit(visit: VisitWithMeta): Promise<void> {
  const paths = visit.photos.map((p) => p.storage_path)
  if (visit.storefront_photo_url) paths.push(visit.storefront_photo_url)
  if (visit.storefront_thumbnail_url) paths.push(visit.storefront_thumbnail_url)
  await removeStorageObjects(paths)
  const { error } = await supabase.from('visits').delete().eq('id', visit.id)
  if (error) throw error
}

/** Best-effort removal of every storage object under a visit folder. */
async function deleteVisitObjectsUnder(userId: string, visitId: string): Promise<void> {
  try {
    const { data } = await supabase.storage.from(STORAGE_BUCKET).list(`${userId}/${visitId}`, {
      limit: 1000,
    })
    const paths = (data ?? []).map((o) => `${userId}/${visitId}/${o.name}`)
    await removeStorageObjects(paths)
  } catch {
    /* best effort */
  }
}

async function removeStorageObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const CHUNK = 100
  for (let i = 0; i < paths.length; i += CHUNK) {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths.slice(i, i + CHUNK))
    if (error) throw error
  }
}

// ------------------------------------------------------------------ gallery

export interface GalleryFilters {
  customerId?: string
  visitType?: string
  status?: string
  date?: string // yyyy-MM-dd
  /** Admin-only: narrow to a single salesperson's photos. */
  scopeUserId?: string
}

export async function fetchGalleryPhotos(
  filters: GalleryFilters,
  page: number,
): Promise<{ photos: GalleryPhoto[]; hasMore: boolean }> {
  const from = page * GALLERY_PAGE_SIZE
  let query = supabase
    .from('visit_photos')
    .select(
      'id,visit_id,storage_path,position,created_at, visit:visits!inner(id,visited_at,visit_type,status,customer_id, customer:customers(id,name,code,city,customer_category,custom_category,roshen_available,distributor))',
    )
    .order('created_at', { ascending: false })
    .range(from, from + GALLERY_PAGE_SIZE - 1)
  if (filters.scopeUserId) query = query.eq('user_id', filters.scopeUserId)
  if (filters.customerId) query = query.eq('visit.customer_id', filters.customerId)
  if (filters.visitType) query = query.eq('visit.visit_type', filters.visitType)
  if (filters.status) query = query.eq('visit.status', filters.status)
  if (filters.date) {
    const start = new Date(`${filters.date}T00:00:00`)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    query = query
      .gte('visit.visited_at', start.toISOString())
      .lt('visit.visited_at', end.toISOString())
  }
  const { data, error } = await query
  if (error) throw error
  const photos = data as unknown as GalleryPhoto[]
  return { photos, hasMore: photos.length === GALLERY_PAGE_SIZE }
}

// ------------------------------------------------------------------- photos

export async function fetchSignedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, 60 * 60 * 24 * 7)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const entry of data) {
    // Depending on the storage-js version the field is `signedUrl` (absolute)
    // or `signedURL` (relative to /storage/v1) — normalize to absolute.
    const raw: string | undefined =
      (entry as { signedUrl?: string }).signedUrl ??
      (entry as { signedURL?: string }).signedURL ??
      undefined
    if (raw && entry.path) {
      map[entry.path] = raw.startsWith('http')
        ? raw
        : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${raw}`
    }
  }
  return map
}

// -------------------------------------------------------------------- stats

export interface Stats {
  today: number
  week: number
  month: number
  totalVisits: number
  totalCustomers: number
  totalPhotos: number
  followUp: number
  urgent: number
  byDay: { date: string; count: number }[]
  byType: Record<string, number>
  byStatus: Record<string, number>
}

async function countVisits(modify?: (q: any) => any, scopeUserId?: string): Promise<number> {
  let query = supabase.from('visits').select('id', { count: 'exact', head: true })
  if (scopeUserId) query = query.eq('user_id', scopeUserId)
  if (modify) query = modify(query)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

export async function fetchStats(scopeUserId?: string): Promise<Stats> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = (startOfDay.getDay() + 6) % 7 // Monday-based week
  const startOfWeek = new Date(startOfDay.getTime() - day * 24 * 60 * 60 * 1000)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const chartStart = new Date(startOfDay.getTime() - 13 * 24 * 60 * 60 * 1000)

  let customersQuery = supabase.from('customers').select('id', { count: 'exact', head: true })
  if (scopeUserId) customersQuery = customersQuery.eq('owner_user_id', scopeUserId)
  let photosQuery = supabase.from('visit_photos').select('id', { count: 'exact', head: true })
  if (scopeUserId) photosQuery = photosQuery.eq('user_id', scopeUserId)
  let recentQuery = supabase
    .from('visits')
    .select('visited_at,visit_type,status')
    .gte('visited_at', chartStart.toISOString())
    .limit(2000)
  if (scopeUserId) recentQuery = recentQuery.eq('user_id', scopeUserId)

  const [today, week, month, totalVisits, followUp, urgent, customers, photos, recent] =
    await Promise.all([
      countVisits((q) => q.gte('visited_at', startOfDay.toISOString()), scopeUserId),
      countVisits((q) => q.gte('visited_at', startOfWeek.toISOString()), scopeUserId),
      countVisits((q) => q.gte('visited_at', startOfMonth.toISOString()), scopeUserId),
      countVisits(undefined, scopeUserId),
      countVisits((q) => q.eq('status', 'needs_follow_up'), scopeUserId),
      countVisits((q) => q.eq('status', 'urgent'), scopeUserId),
      customersQuery,
      photosQuery,
      recentQuery,
    ])

  if (customers.error) throw customers.error
  if (photos.error) throw photos.error
  if (recent.error) throw recent.error

  const byDayMap = new Map<string, number>()
  for (let i = 0; i < 14; i++) {
    const d = new Date(chartStart.getTime() + i * 24 * 60 * 60 * 1000)
    byDayMap.set(d.toISOString().slice(0, 10), 0)
  }
  const byType: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const row of recent.data as Pick<Visit, 'visited_at' | 'visit_type' | 'status'>[]) {
    const local = new Date(row.visited_at)
    const key = new Date(local.getFullYear(), local.getMonth(), local.getDate())
      .toISOString()
      .slice(0, 10)
    if (byDayMap.has(key)) byDayMap.set(key, (byDayMap.get(key) ?? 0) + 1)
    byType[row.visit_type] = (byType[row.visit_type] ?? 0) + 1
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
  }

  return {
    today,
    week,
    month,
    totalVisits,
    totalCustomers: customers.count ?? 0,
    totalPhotos: photos.count ?? 0,
    followUp,
    urgent,
    byDay: Array.from(byDayMap, ([date, count]) => ({ date, count })),
    byType,
    byStatus,
  }
}

// ------------------------------------------------------------------- search

export interface SearchResults {
  customers: Customer[]
  visits: VisitWithMeta[]
}

export async function searchEverything(
  term: string,
  matchedTypes: string[],
  scopeUserId?: string,
): Promise<{ visits: VisitWithMeta[] }> {
  const safe = term.replace(/[%_,()]/g, ' ').trim()
  if (!safe && matchedTypes.length === 0) return { visits: [] }
  let query = supabase
    .from('visits')
    .select(VISIT_SELECT)
    .order('visited_at', { ascending: false })
    .limit(50)
  if (scopeUserId) query = query.eq('user_id', scopeUserId)
  const conditions: string[] = []
  if (safe) conditions.push(`notes.ilike.%${safe}%`)
  if (matchedTypes.length > 0) conditions.push(`visit_type.in.(${matchedTypes.join(',')})`)
  query = query.or(conditions.join(','))
  const { data, error } = await query
  if (error) throw error
  return { visits: (data as unknown as VisitWithMeta[]).map(sortPhotos) }
}

/** Fetches every visit page for exports (bounded to keep memory sane). */
export async function fetchAllVisits(filters: VisitFilters = {}): Promise<VisitWithMeta[]> {
  const all: VisitWithMeta[] = []
  for (let page = 0; page < 100; page++) {
    const { visits, hasMore } = await fetchVisits(filters, page)
    all.push(...visits)
    if (!hasMore) break
  }
  return all
}

// -------------------------------------------------------- customer summaries

export interface CustomerSummary {
  lastVisitedAt: string | null
  visitCount: number
  hasFollowUp: boolean
  types: string[]
}

/**
 * Per-customer visit rollup for the map: last visit, count, follow-up flag and
 * the set of visit types seen. One scan of the visit table, aggregated client
 * side — fine for a single user's personal history.
 */
export async function fetchCustomerSummaries(
  scopeUserId?: string,
): Promise<Record<string, CustomerSummary>> {
  const summaries: Record<string, CustomerSummary> = {}
  const PAGE = 1000
  for (let page = 0; page < 50; page++) {
    const from = page * PAGE
    let q = supabase
      .from('visits')
      .select('customer_id, visited_at, visit_type, status')
      .order('visited_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (scopeUserId) q = q.eq('user_id', scopeUserId)
    const { data, error } = await q
    if (error) throw error
    const rows = data as {
      customer_id: string
      visited_at: string
      visit_type: string
      status: string
    }[]
    for (const row of rows) {
      const entry =
        summaries[row.customer_id] ??
        (summaries[row.customer_id] = {
          lastVisitedAt: null,
          visitCount: 0,
          hasFollowUp: false,
          types: [],
        })
      entry.visitCount += 1
      if (!entry.lastVisitedAt || row.visited_at > entry.lastVisitedAt) {
        entry.lastVisitedAt = row.visited_at
      }
      if (row.status === 'needs_follow_up' || row.status === 'urgent') entry.hasFollowUp = true
      if (!entry.types.includes(row.visit_type)) entry.types.push(row.visit_type)
    }
    if (rows.length < PAGE) break
  }
  return summaries
}

// ---------------------------------------------------------- customer covers

/**
 * Latest storefront image per customer, for list avatars, the map card and the
 * customer cover. Walks visits newest-first and takes each customer's first
 * visit that yields an effective storefront (dedicated column or gallery fallback).
 */
export async function fetchCustomerCovers(
  scopeUserId?: string,
): Promise<Record<string, StorefrontRef>> {
  const covers: Record<string, StorefrontRef> = {}
  const PAGE = 500
  for (let page = 0; page < 100; page++) {
    const from = page * PAGE
    let cq = supabase
      .from('visits')
      .select(
        'customer_id, visited_at, storefront_photo_url, storefront_thumbnail_url, photos:visit_photos(storage_path, position)',
      )
      .order('visited_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (scopeUserId) cq = cq.eq('user_id', scopeUserId)
    const { data, error } = await cq
    if (error) throw error
    const rows = data as unknown as {
      customer_id: string
      storefront_photo_url: string | null
      storefront_thumbnail_url: string | null
      photos: { storage_path: string; position: number }[]
    }[]
    for (const row of rows) {
      if (covers[row.customer_id]) continue
      const sf = storefrontOf(row)
      if (sf) covers[row.customer_id] = sf
    }
    if (rows.length < PAGE) break
  }
  return covers
}

// ------------------------------------------------------------ pdf image data

/** Signs a storage path, downloads it, and returns a JPEG data URL for jsPDF. */
export async function fetchImageDataUrl(path: string): Promise<string | null> {
  try {
    const map = await fetchSignedUrls([path])
    const url = map[path]
    if (!url) return null
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// -------------------------------------------------------------- report data

/** Fetches every visit matching a report scope (customers and/or date window). */
export async function fetchReportVisits(opts: {
  visitId?: string
  customerIds?: string[]
  from?: string
  to?: string
  scopeUserId?: string
}): Promise<VisitWithMeta[]> {
  if (opts.visitId) {
    const visit = await fetchVisit(opts.visitId)
    return [visit]
  }
  const all: VisitWithMeta[] = []
  const PAGE = 200
  for (let page = 0; page < 500; page++) {
    let query = supabase
      .from('visits')
      .select(VISIT_SELECT)
      .order('visited_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (opts.customerIds && opts.customerIds.length > 0) query = query.in('customer_id', opts.customerIds)
    if (opts.from) query = query.gte('visited_at', opts.from)
    if (opts.to) query = query.lte('visited_at', opts.to)
    if (opts.scopeUserId) query = query.eq('user_id', opts.scopeUserId)
    const { data, error } = await query
    if (error) throw error
    const rows = (data as unknown as VisitWithMeta[]).map(sortPhotos)
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}
