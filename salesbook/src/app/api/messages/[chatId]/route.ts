import { NextRequest, NextResponse } from 'next/server';
import { appendMessage } from '@/lib/store';

// POST /api/messages/:chatId  { text: string } — append an outgoing message.
export async function POST(req: NextRequest, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 });
  const messages = await appendMessage(chatId, {
    me: true,
    t: { ar: text, en: text },
    when: { ar: 'الآن', en: 'now' },
    read: false,
  });
  return NextResponse.json({ messages });
}
