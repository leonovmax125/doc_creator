import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { InvitesManager, type InviteRow } from '@/components/invites-manager';

export default async function InvitesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) redirect('/dashboard/settings/requisites');

  const codes = await sql<InviteRow[]>`
    select code, is_used, created_at from invite_codes order by created_at desc
  `;

  return <InvitesManager initialCodes={codes} />;
}
