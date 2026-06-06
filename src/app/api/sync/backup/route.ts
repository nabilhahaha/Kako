// GET /api/sync/backup — cloud backup/export of this company's synced rows, with
// metadata. Behind KAKO_SYNC (404 when off). The admin can also export the LOCAL
// pending data offline (see src/lib/sync/web/backup.ts).
import { NextResponse } from 'next/server';
import { isSyncEnabledServer } from '@/lib/sync/flag';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { fetchCloudSnapshot } from '@/lib/sync/server/supabase-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSyncEnabledServer()) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ctx = await getUserContext();
  if (!ctx || !ctx.companyId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Admin-only export.
  if (ctx.topRole !== 'admin' && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const rows = await fetchCloudSnapshot(supabase, ctx.companyId);

  const body = {
    kind: 'cloud' as const,
    version: 1 as const,
    meta: {
      exportedAt: new Date().toISOString(),
      userId: ctx.userId,
      companyId: ctx.companyId,
      entities: [...new Set(rows.map((r) => r.entity))],
      count: rows.length,
    },
    rows,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="vantora-cloud-backup_${ctx.companyId}.json"`,
    },
  });
}
