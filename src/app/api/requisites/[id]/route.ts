import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ownsRequisite } from '@/lib/auth/owns';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  if (!(await ownsRequisite(user.id, id))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const label = body?.field_label;
  const value = body?.field_value;
  const sortOrder = body?.sort_order;

  if (label !== undefined) await sql`update requisites set field_label = ${String(label)} where id = ${id}`;
  if (value !== undefined) await sql`update requisites set field_value = ${String(value)} where id = ${id}`;
  if (sortOrder !== undefined) await sql`update requisites set sort_order = ${Number(sortOrder)} where id = ${id}`;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  if (!(await ownsRequisite(user.id, id))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  await sql`delete from requisites where id = ${id}`;
  return NextResponse.json({ ok: true });
}
