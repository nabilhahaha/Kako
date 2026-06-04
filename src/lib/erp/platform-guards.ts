import { getPlatformContext, hasPlatformPermission, type PlatformContext } from './platform-context';
import type { PlatformPermission } from './platform-permissions';

/** ── Server-side platform permission guards ────────────────────────────────
 *  Mirror of the tenant action guards, for the vendor/platform tier. Use in
 *  platform server actions and page guards. */

export async function requirePlatform(
  perm?: PlatformPermission,
): Promise<{ ctx: PlatformContext; error: null } | { ctx: null; error: string }> {
  const ctx = await getPlatformContext();
  if (!ctx || !ctx.isStaff) return { ctx: null, error: 'unauthorized' };
  if (perm && !hasPlatformPermission(ctx, perm)) return { ctx: null, error: 'forbidden' };
  return { ctx, error: null };
}

export async function requirePlatformOwner(): Promise<
  { ctx: PlatformContext; error: null } | { ctx: null; error: string }
> {
  const ctx = await getPlatformContext();
  if (!ctx || !ctx.isOwner) return { ctx: null, error: 'forbidden' };
  return { ctx, error: null };
}
