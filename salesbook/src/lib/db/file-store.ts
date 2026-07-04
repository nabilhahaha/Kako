// File-backed DataStore — the default, dependency-free adapter. Persists the
// workflow state to data/store.json with an in-process cache so concurrent
// route handlers share state within a server instance.
import { promises as fs } from 'fs';
import path from 'path';
import type { ApprovalStatus, ChatMsg } from '../types';
import { DataStore, ServerState, seedState } from './adapter';

export class FileStore implements DataStore {
  private file = path.join(process.cwd(), 'data', 'store.json');
  private cache: ServerState | null = null;

  async getState(): Promise<ServerState> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.cache = { ...seedState(), ...JSON.parse(raw) };
    } catch {
      this.cache = seedState();
      await this.persist();
    }
    return this.cache!;
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch {
      /* read-only fs — cache still serves the session */
    }
  }

  async setRequest(id: string, status: ApprovalStatus): Promise<ServerState> {
    const s = await this.getState();
    s.requests[id] = status;
    await this.persist();
    return s;
  }

  async setReview(id: string, status: ApprovalStatus): Promise<ServerState> {
    const s = await this.getState();
    s.reviews[id] = status;
    await this.persist();
    return s;
  }

  async markNotifsRead(): Promise<ServerState> {
    const s = await this.getState();
    s.notifRead = true;
    await this.persist();
    return s;
  }

  async appendMessage(chatId: string, msg: ChatMsg): Promise<ChatMsg[]> {
    const s = await this.getState();
    s.messages[chatId] = (s.messages[chatId] || []).concat([msg]);
    await this.persist();
    return s.messages[chatId];
  }
}
