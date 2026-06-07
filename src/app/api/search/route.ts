// GET /api/search?q=…&type=… — Search OS query endpoint (V1).
// Tenant isolation: RLS on erp_search_documents (erp_search is SECURITY INVOKER).
// Category gating: reused permission keys via hasPermission. Flag-gated KAKO_SEARCH.
import { NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission, type Permission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { search } from '@/lib/search/service';
import { SEARCH_ENABLED } from '@/lib/search/flags';
import { SEARCH_ENTITY_TYPES, type SearchEntityType } from '@/lib/search/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!SEARCH_ENABLED()) {
    return NextResponse.json({ query: '', categories: [], total: 0, disabled: true });
  }
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  const typeParam = url.searchParams.get('type');
  const types = typeParam && SEARCH_ENTITY_TYPES.includes(typeParam as SearchEntityType)
    ? [typeParam as SearchEntityType] : undefined;

  try {
    const db = await createClient();
    const res = await search(db, q, {
      can: (key) => hasPermission(ctx, key as Permission),
      types,
      perCategory: types ? 25 : 5,   // scoped → deeper; global → top-5 per category
      limit: 60,
    });
    return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Search must never break the app — degrade gracefully.
    return NextResponse.json({ query: q, categories: [], total: 0, error: 'unavailable' });
  }
}
