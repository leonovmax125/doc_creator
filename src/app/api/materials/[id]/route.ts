import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { deleteObject } from '@/lib/storage/local';
import { MATERIAL_TYPES, type MaterialType } from '@/lib/material-types';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  const owned = await sql`select 1 from materials where id = ${id} and user_id = ${user.id} limit 1`;
  if (owned.length === 0) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? '').trim();
  const type: MaterialType = MATERIAL_TYPES.includes(body?.type) ? body.type : 'other';
  const contentText = String(body?.content_text ?? '');
  const tags: string[] = Array.isArray(body?.tags) ? body.tags.map(String) : [];

  await sql`
    update materials
    set name = ${name}, type = ${type}, content_text = ${contentText}, tags = ${tags}
    where id = ${id}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  const rows = await sql<{ file_path: string | null }[]>`
    select file_path from materials where id = ${id} and user_id = ${user.id} limit 1
  `;
  if (!rows[0]) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });

  await sql`delete from materials where id = ${id}`;
  if (rows[0].file_path) await deleteObject('materials', rows[0].file_path);
  return NextResponse.json({ ok: true });
}
