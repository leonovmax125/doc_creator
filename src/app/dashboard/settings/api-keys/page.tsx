import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ApiKeyEditor } from '@/components/api-key-editor';

export default async function ApiKeysPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const rows = await sql<{ gemini_api_key: string | null }[]>`
    select gemini_api_key from user_settings where user_id = ${user.id} limit 1
  `;

  const key = rows[0]?.gemini_api_key ?? null;
  const masked = key ? `${key.slice(0, 4)}…${key.slice(-4)}` : null;

  return <ApiKeyEditor userId={user.id} hasKey={!!key} maskedKey={masked} />;
}
