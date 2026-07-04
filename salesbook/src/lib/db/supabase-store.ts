// Supabase / Postgres DataStore adapter.
//
// Dependency-free: talks to Supabase's PostgREST endpoint over fetch, so the
// build needs no extra packages. The whole workflow state is stored as a single
// JSONB document in the `salesbook_state` table (see supabase/schema.sql).
//
// Activate by setting in the environment:
//   DATA_BACKEND=supabase
//   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
//
// If those are absent the factory falls back to the file store, so this module
// never breaks local/dev runs.
import type { ApprovalStatus, ChatMsg } from '../types';
import { DataStore, ServerState, seedState } from './adapter';

const ROW_ID = 'singleton';

export class SupabaseStore implements DataStore {
  private key: string;
  private endpoint: string;
  private cache: ServerState | null = null;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SupabaseStore requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }
    this.key = key;
    this.endpoint = `${url.replace(/\/$/, '')}/rest/v1/salesbook_state`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async getState(): Promise<ServerState> {
    if (this.cache) return this.cache;
    const res = await fetch(`${this.endpoint}?id=eq.${ROW_ID}&select=state`, { headers: this.headers(), cache: 'no-store' });
    if (res.ok) {
      const rows = (await res.json()) as { state: ServerState }[];
      if (rows.length) {
        this.cache = { ...seedState(), ...rows[0].state };
        return this.cache;
      }
    }
    // no row yet — seed one
    this.cache = seedState();
    await this.upsert();
    return this.cache;
  }

  private async upsert(): Promise<void> {
    if (!this.cache) return;
    await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ id: ROW_ID, state: this.cache }),
    });
  }

  async setRequest(id: string, status: ApprovalStatus): Promise<ServerState> {
    const s = await this.getState();
    s.requests[id] = status;
    await this.upsert();
    return s;
  }

  async setReview(id: string, status: ApprovalStatus): Promise<ServerState> {
    const s = await this.getState();
    s.reviews[id] = status;
    await this.upsert();
    return s;
  }

  async markNotifsRead(): Promise<ServerState> {
    const s = await this.getState();
    s.notifRead = true;
    await this.upsert();
    return s;
  }

  async appendMessage(chatId: string, msg: ChatMsg): Promise<ChatMsg[]> {
    const s = await this.getState();
    s.messages[chatId] = (s.messages[chatId] || []).concat([msg]);
    await this.upsert();
    return s.messages[chatId];
  }
}
