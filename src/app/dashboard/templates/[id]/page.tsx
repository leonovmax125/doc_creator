import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { TemplateMarkupEditor } from '@/components/template-markup-editor';
import { normalizeBlocks, type TemplateField } from '@/lib/template-types';

type RequisiteOption = { field_key: string; field_label: string };

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const templateRows = await sql<
    { id: string; name: string; category: string | null; blocks: unknown; fields: unknown }[]
  >`
    select id, name, category, blocks, fields from templates
    where id = ${id} and user_id = ${user.id} limit 1
  `;
  const template = templateRows[0];
  if (!template) notFound();

  const orgRequisites = await sql<RequisiteOption[]>`
    select r.field_key, r.field_label from requisites r
    join organizations o on o.id = r.owner_id
    where r.owner_type = 'organization' and o.owner_id = ${user.id}
    order by r.sort_order
  `;

  // Уникальные ключи реквизитов по всем клиентам пользователя.
  const clientRequisites = await sql<RequisiteOption[]>`
    select distinct on (r.field_key) r.field_key, r.field_label
    from requisites r
    join clients c on c.id = r.owner_id
    where r.owner_type = 'client' and c.user_id = ${user.id}
    order by r.field_key
  `;

  return (
    <TemplateMarkupEditor
      templateId={template.id}
      name={template.name}
      category={template.category}
      initialBlocks={normalizeBlocks(template.blocks)}
      initialFields={(template.fields ?? []) as TemplateField[]}
      orgRequisites={orgRequisites}
      clientRequisites={clientRequisites}
    />
  );
}
