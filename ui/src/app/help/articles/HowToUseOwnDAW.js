import styles from '../Help.module.css';
import Link from 'next/link';

export default function HowToUseOwnDAW() {
  return (
    <div>
      <h1 className={styles.articleTitle}>How to use audio from your own DAW</h1>
      <div className={styles.articleBody}>
        <p>
          Sterio allows you to use audio from your own Digital Audio Workstation (DAW) 
          in two ways: using the Sterio Plugin or loopback audio.
        </p>

        <h2>Method A: Sterio Plugin</h2>
        <p>
          Use the <Link href="/plugin">Sterio Plugin</Link>. The <Link href="/help?article=sterio-plugin">Sterio Plugin article</Link> explains how to use the plugin.
        </p>

        <h2>Method B: Loopback Audio</h2>
        <p>
          Loopback audio allows you to route audio from your DAW directly into Sterio&apos;s 
          recording interface in real-time. This is the best method if you want to record 
          directly from your DAW while hearing the track playback in Sterio.
        </p>

        <h3>Step 1: Download Loopback Audio Software</h3>
        <p>
          You&apos;ll need to install a virtual audio device that creates a loopback channel. 
          We recommend <strong>BlackHole 2ch</strong> (works great on macOS), but there are 
          alternatives for other operating systems:
        </p>
        <ul>
          <li><strong>macOS:</strong> BlackHole 2ch (free, open-source)</li>
          <li><strong>Windows:</strong> VB-Audio Virtual Cable (free) or Voicemeeter (free)</li>
          <li><strong>Linux:</strong> JACK or PulseAudio loopback modules</li>
        </ul>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot showing where to download BlackHole 2ch or alternative loopback software]
        </div> */}

        <h3>Step 2: Set Your DAW Output to Loopback</h3>
        <p>
          In your DAW&apos;s audio settings, set the output device to your loopback audio 
          device (e.g., &quot;BlackHole 2ch&quot;). This will route your DAW&apos;s audio 
          output to the virtual device instead of your speakers or headphones.
        </p>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot of DAW audio settings showing output device selection, with loopback device selected]
        </div> */}

        <h3>Step 3: Select Loopback Audio in Sterio</h3>
        <p>
          In Sterio&apos;s DAW interface, open the audio input device selector and choose 
          your loopback audio device as the input source. Now when you play audio in your 
          DAW, it will be captured by Sterio&apos;s recording interface.
        </p>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot of Sterio DAW showing input device dropdown with loopback device selected]
        </div> */}

        
      </div>
    </div>
  );
}

