import { type NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { isPdfDoc, printPathFor, pdfFilename } from '@/lib/pdf/documents';
import { renderUrlToPdf } from '@/lib/pdf/render-pdf';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/erp/audit';

// Document PDF endpoint — renders the EXISTING print page to a PDF (same template
// as Print, so the output is identical to the print view) and returns it as
// application/pdf. The client (Share action) fetches this, wraps it in a File, and
// opens the native share sheet. Auth is enforced here AND the caller's cookies are
// forwarded so the print page renders under their RLS-scoped session.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ doc: string; id: string }> },
) {
  const { doc, id } = await params;
  if (!isPdfDoc(doc) || !id) {
    return NextResponse.json({ error: 'unknown_document' }, { status: 400 });
  }

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Document export/share is a governed permission (R6). Apex bypasses. RLS on the
  // print page remains the row-level authority.
  if (!hasPermission(ctx, 'documents.share') && !hasPermission(ctx, 'documents.export') && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const origin = req.nextUrl.origin;
  const url = `${origin}${printPathFor(doc, id)}`;
  const cookies = req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
  const filename = pdfFilename(req.nextUrl.searchParams.get('name'), id);

  try {
    const pdf = await renderUrlToPdf(url, cookies);
    // Audit the financial-document export/share (best-effort; never blocks).
    try {
      const supabase = await createClient();
      await logAudit(supabase, { action: 'document.export', entity: doc, entityId: id, details: { filename }, companyId: ctx.companyId });
    } catch { /* ignore */ }
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'pdf_generation_failed' }, { status: 500 });
  }
}
