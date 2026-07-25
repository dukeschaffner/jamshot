'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { APP_HOME_PATH } from '@/lib/appRoutes';
import { MARKETING_FOOTER, MARKETING_NAV } from '@/lib/marketing/constants';
import { marketingHomeLinkProps } from '@/lib/marketing/marketingHomeNav';
import MarketingReveal from './MarketingReveal';
import styles from './MarketingSite.module.css';

function isActiveNav(href, pathname) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MarketingLayout({ children }) {
  const pathname = usePathname();
  const { isAuthenticated, user, isLoading } = useUser();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className={styles.site}>
      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}>
        <Link className={styles.brand} href="/" aria-label="Sterio home" {...marketingHomeLinkProps('/')}>
          <span className={styles.brandMark} aria-hidden="true">S</span>
          <span>Sterio</span>
        </Link>
        <button
          className={styles.navToggle}
          type="button"
          aria-expanded={navOpen}
          aria-controls="site-nav"
          onClick={() => setNavOpen((open) => !open)}
        >
          <span className={styles.srOnly}>Toggle navigation</span>
          <span />
          <span />
          <span />
        </button>
        <nav
          className={`${styles.nav} ${navOpen ? styles.navOpen : ''}`}
          id="site-nav"
          aria-label="Primary navigation"
        >
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActiveNav(item.href, pathname) ? 'page' : undefined}
              {...marketingHomeLinkProps(item.href)}
            >
              {item.label}
            </Link>
          ))}
          <Link href={APP_HOME_PATH}>Browse Tracks</Link>
          {!isLoading && (
            isAuthenticated ? (
              <>
                <Link className={styles.navCta} href={APP_HOME_PATH}>
                  Go to Feed
                </Link>
                {user?.username && (
                  <Link href={`/user/${user.username}`}>My Profile</Link>
                )}
              </>
            ) : (
              <>
                <Link className={styles.navCta} href="/register">
                  Join Sterio
                </Link>
                <Link href="/login">Login</Link>
              </>
            )
          )}
        </nav>
      </header>

      <main>{children}</main>

      <footer className={styles.footer} id="contact">
        <div>
          <Link className={`${styles.brand} ${styles.footerBrand}`} href="/" {...marketingHomeLinkProps('/')}>
            <span className={styles.brandMark} aria-hidden="true">S</span>
            <span>Sterio.fm</span>
          </Link>
          <p>Music collaboration that feels more like jamming than managing files.</p>
        </div>
        <nav aria-label="Footer navigation">
          {MARKETING_FOOTER.map((item) => (
            <Link key={`${item.href}-${item.label}`} href={item.href} {...marketingHomeLinkProps(item.href)}>
              {item.label}
            </Link>
          ))}
        </nav>
      </footer>

      <MarketingReveal />
    </div>
  );
}
