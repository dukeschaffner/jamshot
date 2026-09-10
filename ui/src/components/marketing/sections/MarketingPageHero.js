import styles from '../MarketingSite.module.css';

export default function MarketingPageHero({ eyebrow, headline, subhead }) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <section className={`${styles.pageHero} ${styles.sectionPad}`}>
      <div className={`${styles.narrow} ${reveal}`} data-reveal>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1>{headline}</h1>
        {subhead && <p>{subhead}</p>}
      </div>
    </section>
  );
}
