import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { deleteObject } from '@/lib/storage/local';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  const rows = await sql<{ file_path: string }[]>`
    select file_path from stamps where id = ${id} and user_id = ${user.id} limit 1
  `;
  if (!rows[0]) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });

  await sql`delete from stamps where id = ${id}`;
  await deleteObject('stamps', rows[0].file_path);
  return NextResponse.json({ ok: true });
}
