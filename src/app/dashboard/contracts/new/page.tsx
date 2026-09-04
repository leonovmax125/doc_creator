import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ContractWizard } from '@/components/contract-wizard';
import type { TemplateField } from '@/lib/template-types';

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: initialClientId } = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;

  const [clients, templates, orgRequisites, stamps, materials] = await Promise.all([
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
    sql`select id, name from materials where user_id = ${user.id} order by created_at desc`,
  ]);

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
      materials={materials as never}
      initialClientId={initialClientId}
    />
  );
}
