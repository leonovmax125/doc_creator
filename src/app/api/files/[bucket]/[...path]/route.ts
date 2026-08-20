import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getObject, objectExists, ownerOf, type Bucket } from '@/lib/storage/local';

export const runtime = 'nodejs';

const BUCKETS: Bucket[] = ['templates', 'stamps', 'logos', 'materials', 'contracts'];

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
};

/**
 * Приватная отдача файлов (заменяет подписанные ссылки Supabase Storage).
 * Пускаем только владельца: у всех бакетов путь начинается с userId владельца.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bucket: string; path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { bucket, path } = await params;
  if (!BUCKETS.includes(bucket as Bucket)) {
    return NextResponse.json({ error: 'Неизвестный бакет' }, { status: 404 });
  }

  const objectPath = path.join('/');
  if (ownerOf(objectPath) !== user.id) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  if (!(await objectExists(bucket as Bucket, objectPath))) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });
  }

  const buffer = await getObject(bucket as Bucket, objectPath);
  const ext = objectPath.slice(objectPath.lastIndexOf('.') + 1).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
