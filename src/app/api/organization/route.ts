import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

/** Обновляет название/страну своей организации. */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = body?.name;
  const country = body?.country;

  if (name !== undefined) {
    await sql`update organizations set name = ${String(name)} where owner_id = ${user.id}`;
  }
  if (country !== undefined) {
    await sql`update organizations set country = ${String(country)} where owner_id = ${user.id}`;
  }

  return NextResponse.json({ ok: true });
}
