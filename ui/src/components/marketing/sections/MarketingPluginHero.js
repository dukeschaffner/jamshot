import MarketingAuthAction from '@/components/marketing/MarketingAuthAction';
import { resolveMarketingAsset } from '@/lib/marketing/constants';
import styles from '../MarketingSite.module.css';

export default function MarketingPluginHero({
  eyebrow,
  headline,
  subhead,
  image,
  imageAlt,
  caption,
  actions = [],
}) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <section className={`${styles.pluginHero} ${styles.sectionPad}`}>
      <div className={`${styles.pluginHeroCopy} ${reveal}`} data-reveal>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1>{headline}</h1>
        {subhead && <p>{subhead}</p>}
        {actions.length > 0 && (
          <div className={styles.centeredActions}>
            {actions.map((action) => (
              <MarketingAuthAction key={`${action.label}-${action.href}`} action={action} />
            ))}
          </div>
        )}
      </div>
      <figure className={`${styles.pluginStage} ${reveal}`} data-reveal>
        <img src={resolveMarketingAsset(image)} alt={imageAlt} />
        {caption && (
          <figcaption>
            <strong>Important setup note:</strong> {caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}
