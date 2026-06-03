import { NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getEntity, entityCapabilities } from '@/lib/erp/entities';
import { toCsv, toJson, toXlsx, type ExportRow } from '@/lib/erp/export-serialize';
import { getActiveCustomFields } from '@/lib/erp/custom-fields-server';
import { rateLimit, clientIp } from '@/lib/erp/rate-limit';

/** ── Generic Export Engine ─────────────────────────────────────────────────
 *  GET /api/export?entity=customer&format=csv|xlsx|json&q=&status=&limit=
 *
 *  One reusable endpoint for EVERY registered entity — no entity-specific export
 *  screens or routes. The exported columns are the entity descriptor's `fields`
 *  (the same business-facing shape as import, so an export round-trips back
 *  through the Import Engine). Access requires `integrations.manage` AND the
 *  entity's own permission; the query is company-scoped by RLS. Filters (search,
 *  status) and a row limit are applied generically. Runs on the Node runtime so
 *  the pure-JS .xlsx writer (Buffers) works. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 50000;
const DEFAULT_LIMIT = 10000;
// Per-user export throttle (defense-in-depth against bulk-export abuse). In-memory
// rolling window — see rate-limit.ts for the per-instance limitation.
const EXPORT_LIMIT = 30;
const EXPORT_WINDOW_MS = 60_000;
type Format = 'csv' | 'xlsx' | 'json';

export async function GET(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(ctx, 'integrations.manage'))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Rate limit per authenticated user (fall back to IP if userId is missing).
  const rlKey = `export:${ctx.userId || clientIp(req.headers)}`;
  const rl = rateLimit(rlKey, EXPORT_LIMIT, EXPORT_WINDOW_MS);
  if (!rl.ok)
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );

  const sp = req.nextUrl.searchParams;
  const entityKey = sp.get('entity') ?? '';
  const format = (sp.get('format') ?? 'csv').toLowerCase() as Format;
  if (!['csv', 'xlsx', 'json'].includes(format))
    return NextResponse.json({ error: 'bad format' }, { status: 400 });

  const entity = getEntity(entityKey);
  if (!entity || !entity.fields || entity.fields.length === 0 || !entityCapabilities(entityKey).exportable)
    return NextResponse.json({ error: 'unknown or non-exportable entity' }, { status: 400 });

  // Respect the entity's own permission (not just the area gate).
  if (entity.permission && !hasPermission(ctx, entity.permission))
    return NextResponse.json({ error: 'forbidden for this entity' }, { status: 403 });

  const cols = entity.fields.map((f) => f.key);
  const textCols = entity.fields
    .filter((f) => !f.type || f.type === 'text' || f.type === 'email')
    .map((f) => f.key);

  const limit = Math.min(MAX_ROWS, Math.max(1, Number(sp.get('limit')) || DEFAULT_LIMIT));
  const q = (sp.get('q') ?? '').trim().replace(/[,()%*\\]/g, ' ').trim();
  const status = (sp.get('status') ?? '').trim();

  const supabase = await createClient();

  // Custom fields (Phase A): values live in the row's `custom` jsonb. Include
  // them as extra columns so export stays custom-field-compatible.
  const customFields = await getActiveCustomFields(entityKey, supabase);
  const selectCols = customFields.length > 0 ? [...cols, 'custom'] : cols;

  let query = supabase.from(entity.table).select(selectCols.join(',')).limit(limit);
  query = query.order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (q && textCols.length > 0) query = query.or(textCols.map((c) => `${c}.ilike.%${q}%`).join(','));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Flatten custom values into top-level columns (arrays → "a|b", objects → JSON).
  const headers = [...cols, ...customFields.map((f) => f.key)];
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    if (customFields.length === 0) return r as ExportRow;
    const bag = (r.custom as Record<string, unknown>) ?? {};
    const out: Record<string, unknown> = { ...r };
    delete out.custom;
    for (const f of customFields) {
      const v = bag[f.key];
      out[f.key] = Array.isArray(v) ? v.join('|') : v != null && typeof v === 'object' ? JSON.stringify(v) : v ?? '';
    }
    return out as ExportRow;
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${entity.key}-export-${stamp}`;

  if (format === 'json') {
    return new NextResponse(toJson(headers, rows), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (format === 'csv') {
    const body = '﻿' + toCsv(headers, rows); // BOM → Excel reads UTF-8
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // xlsx
  const buf = toXlsx(entity.labelEn || entity.key, headers, rows);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${base}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
