import Link from 'next/link';
import styles from '../Help.module.css';

export default function DAWBestPractices() {
  return (
    <div>
      <h1 className={styles.articleTitle}>DAW Best Practices</h1>
      <div className={styles.articleBody}>
        <p>
          Use these tips to get the smoothest, most responsive recording experience in
          Sterio&apos;s DAW.
        </p>

        <h2>For best results (low latency recording)</h2>

        <h3>Use headphones</h3>
        <p>
          Avoid using your device speakers. Headphones prevent echo and reduce delay.
        </p>

        <h3>Use an external mic or audio interface (recommended)</h3>
        <p>
          USB microphones, headsets, or audio interfaces typically perform much better
          than built-in laptop mics.
        </p>

        <h3>Use Chrome or Edge</h3>
        <p>
          For the lowest latency and best compatibility, we recommend Google Chrome or
          Microsoft Edge. Firefox and Safari may have higher delay on some setups.
        </p>

        <h3>Disable system audio effects</h3>
        <p>If possible, turn off noise suppression, echo cancellation, and auto gain control.</p>

        <h3>Close other apps</h3>
        <p>
          Apps using your microphone or audio (Zoom, Discord, etc.) can increase latency.
        </p>

        <h3>Lower your buffer size (if using an external interface)</h3>
        <p>
          If your device/software allows it, use a lower buffer size for better responsiveness.
        </p>

        <h2>Pro tip: near-zero latency recording</h2>
        <p>
          For near-zero latency recording, you can either:
          <ul>
            <li>
              - Directly monitor audio from your audio interface if using one.
            </li>
            <li>
              - Use the <Link href="/plugin">Sterio Plugin</Link> in your own
              DAW (Ableton, Logic, FL Studio, etc.), record your audio there, export a{' '}
              <strong>.wav</strong> file, and upload it into Sterio.
            </li>
          </ul>
        </p>
      </div>
    </div>
  );
}

