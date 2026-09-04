import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ownsCase } from '@/lib/auth/owns';

export const runtime = 'nodejs';

const STATUSES = ['draft', 'active', 'signed', 'archived'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  if (!(await ownsCase(user.id, id))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (body?.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Неверный статус' }, { status: 400 });
    }
    await sql`update cases set status = ${body.status} where id = ${id}`;
  }
  if (body?.title !== undefined) {
    await sql`update cases set title = ${String(body.title)} where id = ${id}`;
  }

  return NextResponse.json({ ok: true });
}
