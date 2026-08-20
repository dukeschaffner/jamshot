'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import { outreachApi } from '@/lib/outreachApi';

type Props = {
  children: ReactNode;
};

export function RequireAdmin({ children }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const session = await authClient.getSession();
        if (!session.data?.session) {
          router.replace('/login');
          return;
        }

        const me = await outreachApi.getMe();
        if (!me.is_admin) {
          setError('Sterio admin access required.');
          return;
        }

        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) router.replace('/login');
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <main>
        <div className="panel">
          <p className="error">{error}</p>
          <Link href="/login">Back to login</Link>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main>
        <p className="muted">Checking admin access…</p>
      </main>
    );
  }

  return <>{children}</>;
}
