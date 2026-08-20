import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { fileUrl } from '@/lib/files';
import { RefineChat } from '@/components/refine-chat';

export default async function RefinePage({
  params,
}: {
  params: Promise<{ caseId: string; versionId: string }>;
}) {
  const { caseId, versionId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const versionRows = await sql<{ id: string; case_id: string; version_number: number; docx_path: string | null }[]>`
    select v.id, v.case_id, v.version_number, v.docx_path
    from contract_versions v
    join cases c on c.id = v.case_id
    where v.id = ${versionId} and c.user_id = ${user.id}
    limit 1
  `;
  const version = versionRows[0];
  if (!version || version.case_id !== caseId) notFound();

  const messages = await sql<{ id: string; role: 'user' | 'assistant'; content: string }[]>`
    select id, role, content from chat_messages where version_id = ${versionId} order by created_at
  `;

  const dateStr = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <Link
        href={`/dashboard/contracts/${caseId}`}
        className="mb-3 inline-block text-sm text-muted hover:text-fg"
      >
        ← Назад к делу
      </Link>
      <RefineChat
        versionId={version.id}
        versionNumber={version.version_number}
        initialMessages={messages}
        initialUrl={fileUrl('contracts', version.docx_path)}
        initialFilename={`Договор_${dateStr}.docx`}
      />
    </div>
  );
}
