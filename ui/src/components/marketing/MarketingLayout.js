'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MARKETING_FOOTER, MARKETING_NAV } from '@/lib/marketing/constants';
import MarketingReveal from './MarketingReveal';
import styles from './MarketingSite.module.css';

function isActiveNav(href, pathname) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MarketingLayout({ children }) {
  const pathname = usePathname();
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
        <Link className={styles.brand} href="/" aria-label="Sterio home">
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
            >
              {item.label}
            </Link>
          ))}
          <Link href="/feed">Browse Tracks</Link>
          <Link className={styles.navCta} href="/register">
            Join Sterio
          </Link>
          <Link href="/login">Login</Link>
        </nav>
      </header>

      <main>{children}</main>

      <footer className={styles.footer} id="contact">
        <div>
          <Link className={`${styles.brand} ${styles.footerBrand}`} href="/">
            <span className={styles.brandMark} aria-hidden="true">S</span>
            <span>Sterio</span>
          </Link>
          <p>Music collaboration that feels more like jamming than managing files.</p>
        </div>
        <nav aria-label="Footer navigation">
          {MARKETING_FOOTER.map((item) => (
            <Link key={`${item.href}-${item.label}`} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </footer>

      <MarketingReveal />
    </div>
  );
}
