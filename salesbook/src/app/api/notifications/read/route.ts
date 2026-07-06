import { NextResponse } from 'next/server';
import { markNotifsRead } from '@/lib/store';

// POST /api/notifications/read — mark all notifications read.
export async function POST() {
  const state = await markNotifsRead();
  return NextResponse.json({ notifRead: state.notifRead });
}
