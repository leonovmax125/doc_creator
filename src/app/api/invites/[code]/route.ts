import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { code } = await params;
  await sql`delete from invite_codes where code = ${decodeURIComponent(code)}`;
  return NextResponse.json({ ok: true });
}
