import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { MaterialEditor } from '@/components/material-editor';

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const rows = await sql`
    select id, name, type, content_text, tags, file_path from materials
    where id = ${id} and user_id = ${user.id} limit 1
  `;
  const material = rows[0];
  if (!material) notFound();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-fg">{material.name}</h1>
      <MaterialEditor material={material as never} />
    </div>
  );
}
