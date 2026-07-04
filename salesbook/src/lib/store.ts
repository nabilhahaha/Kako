// Facade over the configured DataStore (see src/lib/db). API route handlers
// import from here and stay agnostic of the backend (file today, Supabase in prod).
import { getStore } from './db';
import type { ApprovalStatus, ChatMsg } from './types';

export type { ServerState } from './db';

export const getState = () => getStore().getState();
export const setRequest = (id: string, status: ApprovalStatus) => getStore().setRequest(id, status);
export const setReview = (id: string, status: ApprovalStatus) => getStore().setReview(id, status);
export const markNotifsRead = () => getStore().markNotifsRead();
export const appendMessage = (chatId: string, msg: ChatMsg) => getStore().appendMessage(chatId, msg);
