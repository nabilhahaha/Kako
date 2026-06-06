// Process-wide singleton SyncStatusStore so the badge and the orchestrator share
// one source of truth. Importing this module has no effect until the provider
// starts the orchestrator (behind KAKO_SYNC).
import { SyncStatusStore } from '@/lib/sync/web/status';

export const syncStatusStore = new SyncStatusStore();
