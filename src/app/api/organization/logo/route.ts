import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { putObject } from '@/lib/storage/local';
import { fileUrl } from '@/lib/files';

export const runtime = 'nodejs';

/** Загружает логотип организации (PNG) и сохраняет путь. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Файл не выбран' }, { status: 400 });
  }

  const path = `${user.id}/logo.png`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await putObject('logos', path, buffer);
  await sql`update organizations set logo_path = ${path} where owner_id = ${user.id}`;

  return NextResponse.json({ logoPath: path, url: fileUrl('logos', path) });
}
