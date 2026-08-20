'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';

type Props = {
  children: ReactNode;
};

export function AdminShell({ children }: Props) {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <div className="admin-shell">
      <main>
        <header>
          <div>
            <Link href="/" className="brand">
              Sterio Admin
            </Link>
            <nav style={{ marginTop: 10 }}>
              <Link href="/outreach">Campaigns</Link>
              <Link href="/outreach/variants">Message variants</Link>
            </nav>
          </div>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </header>
        {children}
      </main>
    </div>
  );
}
