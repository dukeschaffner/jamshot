'use client';

import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { resolveMarketingAction } from '@/lib/marketing/resolveMarketingAction';
import styles from './MarketingSite.module.css';

export default function MarketingAuthAction({ action }) {
  const { isAuthenticated, user } = useUser();
  const resolved = resolveMarketingAction(action, { isAuthenticated, user });

  if (!resolved?.label || !resolved?.href) return null;

  const className = resolved.variant === 'secondary'
    ? `pill-btn ${styles.secondaryBtn}`
    : 'pill-btn gradient-btn ';

  const style = {
    color: 'var(--text-primary)',
    width: 'min-content',
    justifySelf: 'center',
  };

  if (resolved.href.startsWith('mailto:') || resolved.href.startsWith('http')) {
    return (
      <a className={className} style={style} href={resolved.href}>
        {resolved.label}
      </a>
    );
  }

  return (
    <Link className={className} style={style} href={resolved.href}>
      {resolved.label}
    </Link>
  );
}
