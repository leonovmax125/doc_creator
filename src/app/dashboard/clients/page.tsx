import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ClientsList } from '@/components/clients-list';

export default async function ClientsPage() {
  const user = await getCurrentUser();
  const clients = user
    ? await sql`
        select id, name, country, contact_person from clients
        where user_id = ${user.id} order by name
      `
    : [];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-fg">Клиенты</h1>
      <ClientsList clients={clients as never} />
    </div>
  );
}
