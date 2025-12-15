import styles from '../Help.module.css';

export default function HowToAllowAudioAccess() {
  return (
    <div>
      <h1 className={styles.articleTitle}>How to allow audio access</h1>
      <div className={styles.articleBody}>
        <p>
          To use Sterio&apos;s DAW recording features, your browser needs permission to 
          access your microphone and audio input devices. The process varies slightly 
          depending on which browser you&apos;re using.
        </p>

        <h2>Chrome / Chromium-based Browsers</h2>
        <p>
          Chrome, Edge, Brave, and other Chromium-based browsers use a unified permission system.
        </p>

        <h3>Step 1: Initial Permission Prompt</h3>
        <p>
          When you first try to record in Sterio&apos;s DAW, your browser will show a 
          permission prompt asking to access your microphone. Click &quot;Allow&quot; 
          to grant permission.
        </p>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot of Chrome permission prompt asking for microphone access]
        </div> */}

        <h3>Step 2: If You Denied Permission</h3>
        <p>
          If you accidentally denied permission or need to change it later:
        </p>
        <ol>
          <li>Click the lock icon or information icon in the address bar (left side of the URL)</li>
          <li>Find the &quot;Microphone&quot; setting</li>
          <li>Change it from &quot;Block&quot; to &quot;Allow&quot;</li>
          <li>Refresh the page</li>
        </ol>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot showing Chrome site settings with microphone permission dropdown]
        </div> */}

        <h3>Step 3: System-Level Permissions (macOS)</h3>
        <p>
          On macOS, you may also need to grant system-level microphone access:
        </p>
        <ol>
          <li>Open System Settings (or System Preferences on older macOS versions)</li>
          <li>Go to Privacy &amp; Security → Microphone</li>
          <li>Find your browser (Chrome, Edge, etc.) in the list</li>
          <li>Enable the toggle next to your browser</li>
        </ol>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot of macOS System Settings showing microphone permissions with browser enabled]
        </div> */}

        <h2>Firefox</h2>
        <p>
          Firefox uses a similar permission system but with slightly different interface elements.
        </p>

        <h3>Step 1: Permission Prompt</h3>
        <p>
          When you try to record, Firefox will show a prompt asking for microphone access. 
          Click &quot;Allow&quot; and optionally check &quot;Remember this decision&quot; 
          to avoid future prompts.
        </p>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot of Firefox permission prompt for microphone access]
        </div> */}

        <h3>Step 2: Managing Permissions</h3>
        <p>
          To change microphone permissions in Firefox:
        </p>
        <ol>
          <li>Click the shield icon in the address bar</li>
          <li>Click &quot;Permissions&quot;</li>
          <li>Find &quot;Use the Microphone&quot; and click &quot;Allow&quot;</li>
        </ol>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot of Firefox site permissions panel]
        </div> */}

        <h2>Safari (macOS)</h2>
        <p>
          Safari has stricter privacy controls and requires both browser and system permissions.
        </p>

        <h3>Step 1: Enable Microphone in Safari Preferences</h3>
        <ol>
          <li>Open Safari → Settings (or Preferences)</li>
          <li>Go to the &quot;Websites&quot; tab</li>
          <li>Select &quot;Microphone&quot; from the left sidebar</li>
          <li>Find sterio.com in the list and set it to &quot;Allow&quot;</li>
        </ol>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot of Safari Preferences showing microphone website permissions]
        </div> */}

        <h3>Step 2: System-Level Permissions</h3>
        <p>
          Safari also requires macOS system-level microphone access:
        </p>
        <ol>
          <li>Open System Settings → Privacy &amp; Security → Microphone</li>
          <li>Enable Safari in the list</li>
        </ol>

        <h2>Testing Your Setup</h2>
        <p>
          After granting permissions, you can test if everything is working:
        </p>
        <ol>
          <li>Go to Sterio&apos;s DAW interface</li>
          <li>Click the input device selector</li>
          <li>You should see your microphone and other audio input devices listed</li>
          <li>Select your desired input device</li>
          <li>Try recording a short test - you should see audio levels moving</li>
        </ol>

        {/* <div className={styles.imagePlaceholder}>
          [Image: Screenshot of Sterio DAW showing input device selector with available devices listed]
        </div> */}

        <h2>Troubleshooting</h2>
        <h3>No Microphone Devices Showing</h3>
        <ul>
          <li>Make sure your microphone is connected and recognized by your operating system</li>
          <li>Check your system audio settings to verify the microphone is working</li>
          <li>Try refreshing the page after granting permissions</li>
          <li>On macOS, ensure both browser and system-level permissions are granted</li>
        </ul>

        <h3>Permission Prompt Not Appearing</h3>
        <ul>
          <li>Check if you previously blocked permissions - you&apos;ll need to manually enable them</li>
          <li>Make sure you&apos;re using HTTPS (Sterio requires secure connections for microphone access)</li>
          <li>Try using an incognito/private window to test if extensions are interfering</li>
        </ul>

        <h3>Audio Not Recording</h3>
        <ul>
          <li>Verify the correct input device is selected in Sterio</li>
          <li>Check your system volume and microphone levels</li>
          <li>Ensure no other applications are exclusively using your microphone</li>
          <li>On Windows, check Windows Privacy Settings → Microphone</li>
        </ul>

        <h2>Privacy Note</h2>
        <p>
          Sterio only accesses your microphone when you open the DAW, and only records audio when you start recording. 
          We never record audio without your explicit action, and all audio processing happens 
          locally in your browser until you choose to upload your recording.
        </p>
      </div>
    </div>
  );
}

