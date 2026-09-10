import { resolveMarketingAsset } from '@/lib/marketing/constants';
import styles from '../MarketingSite.module.css';

export default function MarketingStory({
  image,
  imageAlt,
  eyebrow,
  heading,
  children,
}) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <section className={`${styles.storySection} ${styles.sectionPad}`}>
      <div className={`${styles.storyMedia} ${reveal}`} data-reveal>
        <img src={resolveMarketingAsset(image)} alt={imageAlt} />
      </div>
      <div className={`${styles.storyCopy} ${reveal}`} data-reveal>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2>{heading}</h2>
        {children}
      </div>
    </section>
  );
}
