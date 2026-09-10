import styles from '../MarketingSite.module.css';

export default function HeroPhoneMock() {
  return (
    <div className={styles.phoneMock}>
      <div className={styles.uploadChip}>Upload a musical idea</div>
      <div className={styles.trackCard}>
        <div className={styles.trackTopline}>
          <div>
            <span className={styles.miniLabel}>Chris posted</span>
            <h2>Late night hook idea</h2>
          </div>
          <span className={styles.genrePill}>indie pop</span>
        </div>
        <div className={styles.waveform} aria-hidden="true">
          {Array.from({ length: 10 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
        <div className={styles.trackActions}>
          <button type="button" className={styles.iconButton} aria-label="Play track preview">
            &#9658;
          </button>
          <button type="button" className={styles.takeButton}>
            Add Your Take
          </button>
        </div>
      </div>
      <div className={styles.versionStack}>
        <article>
          <img src="https://cdn.sterio.fm/images/static/duke.jpg" alt="Duke profile photo" />
          <div>
            <strong>Duke added drums</strong>
            <p>Turned the hook into a groove.</p>
          </div>
        </article>
        <article>
          <img src="https://cdn.sterio.fm/images/static/rob.jpg" alt="Rob Stone profile photo" />
          <div>
            <strong>Rob $tone added a verse</strong>
            <p>A music comment that became the next version.</p>
          </div>
        </article>
      </div>
    </div>
  );
}
