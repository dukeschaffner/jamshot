import styles from '../Help.module.css';

export default function HowToUseOwnDAW() {
  return (
    <div>
      <h1 className={styles.articleTitle}>How to use audio from your own DAW</h1>
      <div className={styles.articleBody}>
        <p>
          Sterio allows you to use audio from your own Digital Audio Workstation (DAW) 
          in two ways: using loopback audio or by recording and uploading audio files.
          <br />
          <br />
          We are also working on a way to record and upload audio directly from your own DAW to Sterio.
        </p>

        <h2>Method A: Loopback Audio</h2>
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

        <h2>Method B: Record and Upload Audio File</h2>
        <p>
          If you prefer to work entirely in your own DAW, you can record audio while 
          listening to the track in Sterio, then export and upload the audio file.
        </p>

        <h3>Step 1: Play the Track in Sterio</h3>
        <p>
          Open the track you want to collaborate on in Sterio and start playback. 
          You&apos;ll use this as a reference while recording in your DAW.
        </p>

        <h3>Step 2: Record in Your DAW</h3>
        <p>
          While the track is playing in Sterio, record your part in your DAW. Make sure 
          to sync your recording with the track timing. You can use Sterio&apos;s metronome 
          or count-in features to help with timing.
        </p>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot showing DAW recording interface with Sterio track playing in background]
        </div> */}

        <h3>Step 3: Export Audio File</h3>
        <p>
          Once you&apos;ve finished recording, export your audio from your DAW as a WAV 
          or MP3 file. Make sure the exported file matches the track&apos;s tempo and 
          starts at the correct time.
        </p>

        <h3>Step 4: Upload to Sterio DAW</h3>
        <p>
          In Sterio&apos;s DAW interface, use the upload button to add your exported audio 
          file. The file will be automatically synced with the track timeline.
        </p>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot of Sterio DAW showing upload button and file selection dialog]
        </div> */}

        <h2>Tips for Best Results</h2>
        <ul>
          <li>Make sure your DAW and Sterio are using the same sample rate (typically 44.1kHz or 48kHz)</li>
          <li>When using loopback audio, you may need to adjust your system audio settings to hear both your DAW output and Sterio playback</li>
          <li>For stereo recordings, ensure your loopback device supports stereo channels</li>
          <li>If you experience latency issues with loopback audio, try adjusting buffer sizes in both your DAW and browser settings</li>
        </ul>
      </div>
    </div>
  );
}

