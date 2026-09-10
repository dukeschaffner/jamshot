import styles from '../MarketingSite.module.css';

export default function MarketingSteps({
  eyebrow,
  heading,
  subhead,
  steps = [],
  softBackground = false,
  anchorId,
}) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <section
      className={`${styles.sectionPad} ${softBackground ? styles.softBand : ''}`}
      id={anchorId || undefined}
    >
      <div className={`${styles.sectionHeading} ${reveal}`} data-reveal>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2>{heading}</h2>
        {subhead && <p>{subhead}</p>}
      </div>
      <div className={styles.stepsGrid}>
        {steps.map((step) => (
          <article className={`${styles.stepCard} ${reveal}`} data-reveal key={step.number}>
            <span className={styles.stepNumber}>{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
