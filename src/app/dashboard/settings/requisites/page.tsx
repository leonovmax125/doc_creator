import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { fileUrl } from '@/lib/files';
import { OrganizationCard } from '@/components/organization-card';

type Organization = {
  id: string;
  owner_id: string;
  name: string;
  country: string | null;
  logo_path: string | null;
};

export default async function RequisitesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  let rows = await sql<Organization[]>`
    select id, owner_id, name, country, logo_path from organizations where owner_id = ${user.id} limit 1
  `;

  if (!rows[0]) {
    // Создаём организацию при первом заходе. on conflict — на случай гонки
    // (страница могла отрендериться параллельно из-за prefetch).
    rows = await sql<Organization[]>`
      insert into organizations (owner_id, name) values (${user.id}, '')
      on conflict (owner_id) do update set owner_id = excluded.owner_id
      returning id, owner_id, name, country, logo_path
    `;
  }

  const organization = rows[0];
  if (!organization) {
    return <p className="text-sm text-red-600">Не удалось загрузить организацию.</p>;
  }

  const requisites = await sql`
    select id, field_key, field_label, field_value, sort_order
    from requisites
    where owner_type = 'organization' and owner_id = ${organization.id}
    order by sort_order
  `;

  return (
    <OrganizationCard
      organization={organization}
      requisites={requisites as never}
      initialLogoUrl={fileUrl('logos', organization.logo_path)}
    />
  );
}
