import MarketingAuthAction from '@/components/marketing/MarketingAuthAction';
import styles from '../MarketingSite.module.css';

export default function MarketingCenteredActions({
  eyebrow,
  heading,
  text,
  actions = [],
  anchorId,
}) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <section
      className={`${styles.pluginHelp} ${styles.sectionPad}`}
      id={anchorId || undefined}
    >
      <div className={reveal} data-reveal>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2>{heading}</h2>
        {text && <p>{text}</p>}
        {actions.length > 0 && (
          <div className={styles.centeredActions}>
            {actions.map((action) => (
              <MarketingAuthAction key={`${action.label}-${action.href}`} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
