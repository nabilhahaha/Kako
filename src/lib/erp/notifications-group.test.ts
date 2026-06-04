import { describe, it, expect } from 'vitest';
import { groupNotifications, unreadCount, type NotifLike } from './notifications-group';

const now = new Date('2026-06-10T12:00:00Z');
const list: NotifLike[] = [
  { id: '1', created_at: '2026-06-10T09:00:00Z', read: true, title: 'today-read' },
  { id: '2', created_at: '2026-06-10T11:00:00Z', read: false, title: 'today-unread' },
  { id: '3', created_at: '2026-06-06T09:00:00Z', read: false, title: 'week' },
  { id: '4', created_at: '2026-05-01T09:00:00Z', read: true, title: 'older' },
];

describe('notifications-group', () => {
  it('buckets by recency and puts unread first within a bucket', () => {
    const g = groupNotifications(list, now);
    expect(g.map((x) => x.bucket)).toEqual(['today', 'week', 'older']);
    expect(g[0].items.map((i) => i.title)).toEqual(['today-unread', 'today-read']);
  });
  it('omits empty buckets', () => {
    const g = groupNotifications([{ id: '1', created_at: '2026-06-10T09:00:00Z', title: 'x' }], now);
    expect(g.map((x) => x.bucket)).toEqual(['today']);
  });
  it('unreadCount', () => {
    expect(unreadCount(list)).toBe(2);
  });
});
