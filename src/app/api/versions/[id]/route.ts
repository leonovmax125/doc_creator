import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ownsVersion } from '@/lib/auth/owns';

export const runtime = 'nodejs';

/** Автосохранение блоков версии из блочного редактора. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  if (!(await ownsVersion(user.id, id))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (body?.blocks !== undefined) {
    await sql`update contract_versions set blocks = ${sql.json(body.blocks as never)} where id = ${id}`;
  }

  return NextResponse.json({ ok: true });
}
