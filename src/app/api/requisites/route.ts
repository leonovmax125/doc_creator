import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ownsRequisitesTarget } from '@/lib/auth/owns';

export const runtime = 'nodejs';

type IncomingRow = {
  field_key: string;
  field_label: string;
  field_value?: string;
  sort_order?: number;
};

/** Создаёт одну или несколько строк реквизитов для организации/клиента. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const ownerType = String(body?.ownerType ?? '');
  const ownerId = String(body?.ownerId ?? '');
  const rows: IncomingRow[] = Array.isArray(body?.rows) ? body.rows : [];

  if (!['organization', 'client'].includes(ownerType) || !ownerId || rows.length === 0) {
    return NextResponse.json({ error: 'Неверные данные' }, { status: 400 });
  }
  if (!(await ownsRequisitesTarget(user.id, ownerType, ownerId))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const toInsert = rows.map((r) => ({
    owner_type: ownerType,
    owner_id: ownerId,
    field_key: String(r.field_key),
    field_label: String(r.field_label),
    field_value: String(r.field_value ?? ''),
    sort_order: Number(r.sort_order ?? 0),
  }));

  const inserted = await sql`
    insert into requisites ${sql(toInsert, 'owner_type', 'owner_id', 'field_key', 'field_label', 'field_value', 'sort_order')}
    returning id, field_key, field_label, field_value, sort_order
  `;

  return NextResponse.json({ requisites: inserted });
}
