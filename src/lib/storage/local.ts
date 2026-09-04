import 'server-only';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';

// Локальное хранилище файлов на диске VPS (заменяет Supabase Storage).
// Раскладка: <STORAGE_DIR>/<bucket>/<userId>/<имя>. Приватность обеспечивает
// код: наружу файлы отдаёт только защищённый route, сверяя владельца по пути.

export type Bucket = 'templates' | 'stamps' | 'logos' | 'materials' | 'contracts';

function storageRoot(): string {
  return process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');
}

// Защита от «../» в имени — путь не должен вылезать за пределы бакета.
function safeRelPath(bucket: Bucket, objectPath: string): string {
  const rel = path.posix.normalize(objectPath).replace(/^(\.\.(\/|$))+/, '');
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Недопустимый путь файла');
  return path.join(storageRoot(), bucket, rel);
}

/** Сохраняет файл, возвращает objectPath (относительный, как в Supabase). */
export async function putObject(
  bucket: Bucket,
  objectPath: string,
  data: Buffer,
): Promise<string> {
  const full = safeRelPath(bucket, objectPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return objectPath;
}

export async function getObject(bucket: Bucket, objectPath: string): Promise<Buffer> {
  const full = safeRelPath(bucket, objectPath);
  const { readFile } = await import('node:fs/promises');
  return readFile(full);
}

export function getObjectStream(bucket: Bucket, objectPath: string) {
  return createReadStream(safeRelPath(bucket, objectPath));
}

export async function objectExists(bucket: Bucket, objectPath: string): Promise<boolean> {
  try {
    await stat(safeRelPath(bucket, objectPath));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(bucket: Bucket, objectPath: string): Promise<void> {
  try {
    await unlink(safeRelPath(bucket, objectPath));
  } catch {
    // Файла может уже не быть — это не ошибка при удалении.
  }
}

/** Первый сегмент пути — это userId владельца (см. раскладку выше). */
export function ownerOf(objectPath: string): string {
  return path.posix.normalize(objectPath).split('/')[0] ?? '';
}
