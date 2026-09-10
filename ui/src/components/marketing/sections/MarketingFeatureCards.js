import styles from '../MarketingSite.module.css';

export default function MarketingFeatureCards({ eyebrow, heading, subhead, features = [] }) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <section className={styles.sectionPad}>
      <div className={`${styles.sectionHeading} ${reveal}`} data-reveal>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2>{heading}</h2>
        {subhead && <p>{subhead}</p>}
      </div>
      <div className={styles.featureGrid}>
        {features.map((feature) => (
          <article className={`${styles.featureCard} ${reveal}`} data-reveal key={feature.title}>
            {feature.icon && <span className={styles.featureIcon}>{feature.icon}</span>}
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
