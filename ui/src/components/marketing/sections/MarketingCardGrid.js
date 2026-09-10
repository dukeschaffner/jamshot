import Link from 'next/link';
import MarketingAuthAction from '@/components/marketing/MarketingAuthAction';
import { resolveMarketingAsset } from '@/lib/marketing/constants';
import styles from '../MarketingSite.module.css';

export default function MarketingCardGrid({
  eyebrow,
  heading,
  variant = 'beliefs',
  softBackground = false,
  cards = [],
}) {
  const reveal = `${styles.reveal} marketing-reveal`;
  const gridClass =
    variant === 'team'
      ? styles.teamGrid
      : variant === 'guides'
        ? styles.guideGrid
        : variant === 'downloads'
          ? styles.downloadList
          : styles.beliefGrid;

  return (
    <section
      className={`${styles.sectionPad} ${softBackground ? styles.softBand : ''} ${
        variant === 'guides' ? styles.guideIndex : ''
      }`}
      id={variant === 'downloads' ? 'download' : undefined}
    >
      {(eyebrow || heading) && (
        <div className={`${styles.sectionHeading} ${reveal}`} data-reveal>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h2>{heading}</h2>
        </div>
      )}
      <div className={gridClass}>
        {cards.map((card) => {
          if (variant === 'downloads') {
            return (
              <article className={`${styles.downloadCard} ${reveal}`} data-reveal key={card.title}>
                <div>
                  <h3>{card.title}</h3>
                  {card.text && <p>{card.text}</p>}
                  {card.platform && <span className={styles.downloadPill}>{card.platform}</span>}
                </div>
                <MarketingAuthAction
                  action={{
                    label: card.buttonLabel || 'Download',
                    href: card.buttonHref,
                    variant: 'primary',
                  }}
                />
              </article>
            );
          }

          if (variant === 'team') {
            return (
              <article className={`${styles.teamCard} ${reveal}`} data-reveal key={card.title}>
                {card.image && (
                  <img src={resolveMarketingAsset(card.image)} alt={card.imageAlt || card.title} />
                )}
                <h3>{card.title}</h3>
                {card.role && <p className={styles.role}>{card.role}</p>}
                {card.text && <p>{card.text}</p>}
              </article>
            );
          }

          if (variant === 'guides') {
            return (
              <article
                className={`${styles.guideCard} ${card.featured ? styles.featuredGuide : ''} ${reveal}`}
                data-reveal
                key={card.title}
              >
                {card.meta && <p className={styles.guideMeta}>{card.meta}</p>}
                <h2>
                  {card.href ? <Link href={card.href}>{card.title}</Link> : card.title}
                </h2>
                {card.text && <p>{card.text}</p>}
                {card.href && (
                  <Link className={styles.textLink} href={card.href}>
                    {card.linkLabel || 'Read guide'}
                  </Link>
                )}
              </article>
            );
          }

          return (
            <article className={`${styles.beliefCard} ${reveal}`} data-reveal key={card.title}>
              <h3>{card.title}</h3>
              {card.text && <p>{card.text}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
