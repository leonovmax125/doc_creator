import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { fileUrl } from '@/lib/files';
import { StampsManager, type StampWithUrl } from '@/components/stamps-manager';

export default async function StampsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const stamps = await sql<{ id: string; name: string; type: 'signature' | 'stamp'; file_path: string }[]>`
    select id, name, type, file_path from stamps where user_id = ${user.id} order by created_at desc
  `;

  const withUrls: StampWithUrl[] = stamps.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    signedUrl: fileUrl('stamps', s.file_path),
  }));

  return <StampsManager userId={user.id} stamps={withUrls} />;
}
