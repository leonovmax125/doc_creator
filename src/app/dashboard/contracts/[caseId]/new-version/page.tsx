import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ContractWizard, type WizardPreset } from '@/components/contract-wizard';
import type { TemplateField } from '@/lib/template-types';

export default async function NewVersionPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const caseRows = await sql<{ id: string; title: string; client_id: string }[]>`
    select id, title, client_id from cases where id = ${caseId} and user_id = ${user.id} limit 1
  `;
  const caseRow = caseRows[0];
  if (!caseRow) notFound();

  const lastVersionRows = await sql<{ template_id: string | null; data: { values?: Record<string, string> } }[]>`
    select template_id, data from contract_versions
    where case_id = ${caseId} order by version_number desc limit 1
  `;
  const lastVersion = lastVersionRows[0];
  if (!lastVersion?.template_id) notFound();

  const [clients, templates, orgRequisites, stamps] = await Promise.all([
    sql`select id, name from clients where user_id = ${user.id} order by name`,
    sql<{ id: string; name: string; category: string | null; fields: unknown }[]>`
      select id, name, category, fields from templates where user_id = ${user.id} order by name
    `,
    sql`
      select r.field_key, r.field_label, r.field_value from requisites r
      join organizations o on o.id = r.owner_id
      where r.owner_type = 'organization' and o.owner_id = ${user.id}
    `,
    sql`select id, name, type from stamps where user_id = ${user.id} order by created_at desc`,
  ]);

  const preset: WizardPreset = {
    caseId: caseRow.id,
    caseTitle: caseRow.title,
    clientId: caseRow.client_id,
    templateId: lastVersion.template_id,
    values: lastVersion.data?.values ?? {},
  };

  return (
    <ContractWizard
      clients={clients as never}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        fields: (t.fields ?? []) as TemplateField[],
      }))}
      orgRequisites={orgRequisites as never}
      stamps={stamps as never}
      preset={preset}
    />
  );
}
