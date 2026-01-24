'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNavigationGuard } from '../contexts/NavigationGuardContext';

export default function GuardedLink({ href, children, onClick, ...props }) {
  const router = useRouter();
  const { confirmNavigation } = useNavigationGuard();

  const handleClick = (e) => {
    // Call any existing onClick handler first
    if (onClick) {
      onClick(e);
    }

    // If the onClick handler prevented default, don't proceed with navigation guard
    if (e.defaultPrevented) {
      return;
    }

    // Check if navigation is allowed
    if (!confirmNavigation()) {
      e.preventDefault();
      return;
    }

    // If href is external (starts with http), let the browser handle it normally
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      return;
    }

    // For internal navigation, use router.push for programmatic navigation
    // but only if it's not already being handled by Link component
    if (href && !href.startsWith('#')) {
      e.preventDefault();
      router.push(href);
    }
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
