// Ссылка на приватный файл через наш защищённый route (замена подписанным
// ссылкам Supabase). Без серверных зависимостей — можно звать где угодно.
export function fileUrl(bucket: string, objectPath: string | null | undefined): string | null {
  if (!objectPath) return null;
  return `/api/files/${bucket}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
}
