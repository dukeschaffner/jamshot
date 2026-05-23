import styles from './MarketingSite.module.css'

export default function PreviewBanner() {
  return (
    <div className={styles.previewBanner} role="status" aria-live="polite">
      <span>Internal preview — changes are not live on the site yet.</span>
    </div>
  )
}
