import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ClientCard } from '@/components/client-card';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const clientRows = await sql<
    { id: string; name: string; country: string | null; contact_person: string | null; notes: string | null }[]
  >`
    select id, name, country, contact_person, notes from clients
    where id = ${id} and user_id = ${user.id} limit 1
  `;
  const client = clientRows[0];
  if (!client) notFound();

  const requisites = await sql`
    select id, field_key, field_label, field_value, sort_order from requisites
    where owner_type = 'client' and owner_id = ${client.id} order by sort_order
  `;

  const cases = await sql`
    select id, title, status, created_at from cases
    where client_id = ${client.id} order by created_at desc
  `;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-fg">{client.name}</h1>
      <ClientCard client={client} requisites={requisites as never} cases={cases as never} />
    </div>
  );
}
