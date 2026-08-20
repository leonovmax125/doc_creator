import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ownsTemplate } from '@/lib/auth/owns';

export const runtime = 'nodejs';

/** Обновляет разметку/метаданные шаблона (blocks, fields, name, category). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  if (!(await ownsTemplate(user.id, id))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (body?.blocks !== undefined) {
    await sql`update templates set blocks = ${sql.json(body.blocks as never)} where id = ${id}`;
  }
  if (body?.fields !== undefined) {
    await sql`update templates set fields = ${sql.json(body.fields as never)} where id = ${id}`;
  }
  if (body?.name !== undefined) {
    await sql`update templates set name = ${String(body.name)} where id = ${id}`;
  }
  if (body?.category !== undefined) {
    await sql`update templates set category = ${body.category === null ? null : String(body.category)} where id = ${id}`;
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
  if (!(await ownsTemplate(user.id, id))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  await sql`delete from templates where id = ${id}`;
  return NextResponse.json({ ok: true });
}
