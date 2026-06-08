// ============================================================================
// Mobile Field App — offline sync engine (Phase 7B) — public surface. Offline-
// first field execution: queue mutations on-device, sync idempotently with a
// conflict policy (last-write-wins; server-authoritative for ledgered entities),
// and audit devices. Additive, flag-gated (KAKO_MOBILE, default OFF), multi-tenant
// safe, audit-first. Pure engine over additive schema (erp_offline_mutations +
// erp_device_sessions); the PWA shell, IndexedDB store, media compression, and the
// /api/internal/offline-sync intake build on this. Reuses idempotency (0118) +
// the existing field surfaces (visits/journey/orders/collections/returns/surveys/
// route-riding/van-accounting).
// ============================================================================

export * from './flags';
export * from './types';
export * from './queue';
export * from './conflict';
export * from './apply';
// Note: ./client and ./use-network are 'use client' (IndexedDB/browser) — import
// them directly from their paths, not via this server-safe barrel.
