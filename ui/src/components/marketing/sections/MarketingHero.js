import MarketingAuthAction from '@/components/marketing/MarketingAuthAction';
import styles from '../MarketingSite.module.css';
import HeroPhoneMock from './HeroPhoneMock';

export default function MarketingHero({
  eyebrow,
  headline,
  subhead,
  actions = [],
  stats = [],
  showPhoneMock = true,
}) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <section className={`${styles.hero} ${styles.sectionPad}`}>
      <div className={`${styles.heroCopy} ${reveal}`} data-reveal>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1>{headline}</h1>
        {subhead && <p className={styles.heroSubhead}>{subhead}</p>}
        {actions.length > 0 && (
          <div className={styles.heroActions}>
            {actions.map((action) => (
              <MarketingAuthAction key={`${action.label}-${action.href}`} action={action} />
            ))}
          </div>
        )}
        {stats.length > 0 && (
          <div className={styles.quickStats}>
            {stats.map((stat) => (
              <span key={`${stat.highlight}-${stat.label}`}>
                <strong>{stat.highlight}</strong> {stat.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {showPhoneMock && (
        <div
          className={`${styles.heroVisual} ${reveal}`}
          data-reveal
          aria-label="Mock interface showing a Sterio collaboration thread"
        >
          <HeroPhoneMock />
        </div>
      )}
    </section>
  );
}
