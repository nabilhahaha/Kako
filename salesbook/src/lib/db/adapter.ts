// Database abstraction. The app persists a small amount of mutable "workflow
// state" (membership-request statuses, review-queue statuses, notifications-read
// flag, and appended chat messages). Any backend that implements `DataStore`
// can serve it — a JSON file today, Supabase/Postgres in production.
import { bootstrap } from '../seed';
import type { ApprovalStatus, ChatMsg } from '../types';

export interface ServerState {
  requests: Record<string, ApprovalStatus>;
  reviews: Record<string, ApprovalStatus>;
  notifRead: boolean;
  messages: Record<string, ChatMsg[]>;
}

export interface DataStore {
  getState(): Promise<ServerState>;
  setRequest(id: string, status: ApprovalStatus): Promise<ServerState>;
  setReview(id: string, status: ApprovalStatus): Promise<ServerState>;
  markNotifsRead(): Promise<ServerState>;
  appendMessage(chatId: string, msg: ChatMsg): Promise<ChatMsg[]>;
}

/** Fresh state seeded from the content layer (all requests/reviews pending). */
export function seedState(): ServerState {
  const b = bootstrap();
  const requests: Record<string, ApprovalStatus> = {};
  b.requests.forEach((r) => (requests[r.id] = 'pending'));
  const reviews: Record<string, ApprovalStatus> = {};
  b.reviews.forEach((v) => (reviews[v.id] = 'pending'));
  return { requests, reviews, notifRead: false, messages: {} };
}
