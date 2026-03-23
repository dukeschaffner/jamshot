import Link from 'next/link';
import styles from '../Help.module.css';

export default function SterioPlugin() {
  return (
    <div>
      <h1 className={styles.articleTitle}>Sterio Plugin</h1>
      <div className={styles.articleBody}>
        <p>
          The <Link href="/plugin">Sterio Plugin</Link> is the recommended way to collaborate from your own DAW.
        </p>

        <h2>Recommended workflow</h2>
        <ol>
          <li>
            Open the plugin and sign in. The easiest flow is to log in and open a
            track from your liked tracks inside the plugin.
          </li>
          <li>
            You can also open a track from the web app by clicking the
            {' '}"..."{' '}
            button on a track and selecting
            {' '}<strong>Open in plugin</strong>.
          </li>
          <li>
            In your DAW, create a new software instrument track and choose the
            Sterio plugin as the instrument.
          </li>
          <li>
            Once a track is selected, playback stays in sync with your DAW timeline
            so you can record against the arrangement accurately.
          </li>
          <li>
            After recording, export your take as a <strong>.wav</strong> file and
            import it into the Sterio DAW for uploading.
          </li>
        </ol>
      </div>
    </div>
  );
}
