import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ownsClient } from '@/lib/auth/owns';

export const runtime = 'nodejs';

const FIELDS = ['name', 'country', 'contact_person', 'notes'] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  if (!(await ownsClient(user.id, id))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  for (const field of FIELDS) {
    if (body?.[field] !== undefined) {
      const value = String(body[field]);
      await sql`update clients set ${sql(field)} = ${value} where id = ${id}`;
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  if (!(await ownsClient(user.id, id))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  await sql`delete from clients where id = ${id}`;
  return NextResponse.json({ ok: true });
}
