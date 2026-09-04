import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ownsClient } from '@/lib/auth/owns';

export const runtime = 'nodejs';

/** Значения реквизитов клиента (для автоподстановки в мастере договора). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { id } = await params;
  if (!(await ownsClient(user.id, id))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const rows = await sql<{ field_key: string; field_value: string }[]>`
    select field_key, field_value from requisites
    where owner_type = 'client' and owner_id = ${id} order by sort_order
  `;
  return NextResponse.json({ requisites: rows });
}
