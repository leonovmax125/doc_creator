import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { fileUrl } from '@/lib/files';
import { CaseDetail, type CaseVersionItem } from '@/components/case-detail';
import type { CaseStatus } from '@/lib/case-status';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const caseRows = await sql<{ id: string; title: string; status: CaseStatus; client_name: string }[]>`
    select c.id, c.title, c.status, cl.name as client_name
    from cases c
    join clients cl on cl.id = c.client_id
    where c.id = ${caseId} and c.user_id = ${user.id}
    limit 1
  `;
  const caseRow = caseRows[0];
  if (!caseRow) notFound();

  const versions = await sql<
    { id: string; version_number: number; mode: string; docx_path: string | null; created_at: string }[]
  >`
    select id, version_number, mode, docx_path, created_at from contract_versions
    where case_id = ${caseId} order by version_number desc
  `;

  const versionItems: CaseVersionItem[] = versions.map((v) => ({
    id: v.id,
    versionNumber: v.version_number,
    mode: v.mode,
    createdAt: v.created_at,
    url: fileUrl('contracts', v.docx_path),
  }));

  return (
    <CaseDetail
      caseId={caseRow.id}
      title={caseRow.title}
      status={caseRow.status}
      clientName={caseRow.client_name}
      versions={versionItems}
    />
  );
}
