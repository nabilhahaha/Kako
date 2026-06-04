/**
 * Notification center UX — pure grouping/sorting (no I/O). Adapts the Novu /
 * modern inbox pattern: bucket by recency (today / this week / older),
 * unread-first within each bucket. Pure + testable; the page supplies rows.
 */

export interface NotifLike {
  id: string;
  created_at: string; // ISO
  read?: boolean;
  title: string;
  href?: string;
}

export type NotifBucket = 'today' | 'week' | 'older';

export interface NotifGroup {
  bucket: NotifBucket;
  items: NotifLike[];
}

function bucketFor(createdAt: string, now: Date): NotifBucket {
  const d = new Date(createdAt);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (d >= startOfToday) return 'today';
  const weekAgo = new Date(startOfToday);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (d >= weekAgo) return 'week';
  return 'older';
}

/** Group notifications into today/week/older buckets, unread-first then newest. */
export function groupNotifications(list: readonly NotifLike[], now: Date = new Date()): NotifGroup[] {
  const buckets: Record<NotifBucket, NotifLike[]> = { today: [], week: [], older: [] };
  for (const n of list) buckets[bucketFor(n.created_at, now)].push(n);

  const sortInBucket = (a: NotifLike, b: NotifLike) => {
    const ar = a.read ? 1 : 0;
    const br = b.read ? 1 : 0;
    if (ar !== br) return ar - br; // unread first
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0; // newest first
  };

  return (['today', 'week', 'older'] as NotifBucket[])
    .map((bucket) => ({ bucket, items: buckets[bucket].sort(sortInBucket) }))
    .filter((g) => g.items.length > 0);
}

/** Count of unread notifications (for a nav badge). */
export function unreadCount(list: readonly NotifLike[]): number {
  return list.reduce((n, x) => (x.read ? n : n + 1), 0);
}
