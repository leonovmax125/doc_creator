import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { MaterialsList } from '@/components/materials-list';

export default async function MaterialsPage() {
  const user = await getCurrentUser();
  const materials = user
    ? await sql`
        select id, name, type, tags from materials
        where user_id = ${user.id} order by created_at desc
      `
    : [];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-fg">Материалы</h1>
      <MaterialsList items={materials as never} />
    </div>
  );
}
