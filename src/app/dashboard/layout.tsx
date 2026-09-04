import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { BottomNavLinks } from '@/components/nav-links';
import { LogoutButton } from '@/components/logout-button';
import { Sidebar } from '@/components/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const displayName = user.full_name || user.email;

  return (
    <div className="min-h-screen md:flex">
      <Sidebar displayName={displayName} />

      <div className="flex flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 md:hidden">
          <p className="text-lg font-semibold text-fg">Договоры</p>
          <LogoutButton />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          <div className="animate-in">{children}</div>
        </main>

        <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t md:hidden">
          <BottomNavLinks />
        </nav>
      </div>
    </div>
  );
}
