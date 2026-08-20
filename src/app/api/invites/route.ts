import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';

/** Создаёт код приглашения (только админ). */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const body = await request.json().catch(() => null);
  const code = String(body?.code ?? '').trim().toLowerCase();
  if (!code) return NextResponse.json({ error: 'Пустой код' }, { status: 400 });

  const existing = await sql`select code from invite_codes where code = ${code} limit 1`;
  if (existing.length > 0) {
    return NextResponse.json({ error: 'Такой код уже существует' }, { status: 400 });
  }

  const inserted = await sql`
    insert into invite_codes (code) values (${code})
    returning code, is_used, created_at
  `;
  return NextResponse.json({ invite: inserted[0] });
}
