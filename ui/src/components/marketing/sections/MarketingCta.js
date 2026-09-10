import MarketingAuthAction from '@/components/marketing/MarketingAuthAction';
import styles from '../MarketingSite.module.css';

export default function MarketingCta({
  eyebrow,
  heading,
  text,
  buttonLabel,
  buttonHref,
  anchorId,
}) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <section className={`${styles.finalCta} ${styles.sectionPad}`} id={anchorId || undefined}>
      <div className={reveal} data-reveal>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2>{heading}</h2>
        {text && <p>{text}</p>}
        <MarketingAuthAction
          action={{ label: buttonLabel, href: buttonHref, variant: 'primary' }}
        />
      </div>
    </section>
  );
}
