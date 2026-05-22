'use client';

import { useEffect } from 'react';

export default function MarketingReveal() {
  useEffect(() => {
    const revealItems = document.querySelectorAll('[data-reveal]');

    revealItems.forEach((item, index) => {
      item.style.setProperty('--delay', `${Math.min(index * 45, 220)}ms`);
    });

    if (!('IntersectionObserver' in window)) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 },
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return null;
}
