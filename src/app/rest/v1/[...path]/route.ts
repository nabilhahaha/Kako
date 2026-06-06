// Offline PostgREST proxy: /rest/v1/* → the bundled PostgREST sidecar.
// supabase-js .from()/.rpc() hit this; we forward verbatim so RLS + RPCs run
// unchanged against the local DB. 404 on cloud.
import { NextRequest, NextResponse } from 'next/server';
import { offlineRoutesEnabled, postgrestBaseUrl } from '@/lib/offline/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Headers PostgREST cares about; we forward these from the supabase-js request.
const FORWARD = ['authorization', 'content-type', 'accept', 'prefer', 'range', 'content-profile', 'accept-profile'];

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  if (!offlineRoutesEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const target = `${postgrestBaseUrl()}/${path.join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const init: RequestInit = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) init.body = await req.arrayBuffer();

  const upstream = await fetch(target, init);
  // Pass through body + the headers PostgREST sets (Content-Range for counts, etc.).
  const respHeaders = new Headers();
  for (const [k, v] of upstream.headers) {
    if (['content-type', 'content-range', 'range-unit', 'preference-applied'].includes(k.toLowerCase())) respHeaders.set(k, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: respHeaders });
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path); }
export async function POST(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path); }
export async function PATCH(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path); }
export async function PUT(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path); }
export async function DELETE(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path); }
export async function HEAD(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path); }
