'use client';
import { useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';
import { refreshTrackUrl } from '../lib/api';

export default function TrackPlayer({ audioUrl, trackId, secretToken = null }) {
  const soundRef = useRef(null);
  const [url, setUrl] = useState(audioUrl);
  const urlRefreshAttemptedRef = useRef(false);

  // Function to refresh URL if expired
  const refreshUrl = async () => {
    if (!trackId || urlRefreshAttemptedRef.current) return;
    console.log('URL might be expired, refreshing...');
    
    urlRefreshAttemptedRef.current = true;
    
    try {
      const refreshedUrls = await refreshTrackUrl(trackId, secretToken);
      
      // Update the URL and recreate the Howl instance
      setUrl(refreshedUrls.combined_audio_url || refreshedUrls.audio_url);
      console.log('URL refreshed successfully');
    } catch (err) {
      console.error('Failed to refresh URL:', err);
    }
  };

  useEffect(() => {
    // Reset the URL refresh attempt flag when URL changes
    urlRefreshAttemptedRef.current = false;
    
    // Create new Howl instance with the current URL
    soundRef.current = new Howl({
      src: [url],
      html5: true, // For streaming
      onloaderror: (id, error) => {
        console.error('Error loading audio:', error);
        refreshUrl();
      },
      onplayerror: (id, error) => {
        console.error('Error playing audio:', error);
        refreshUrl();
      }
    });

    return () => {
      soundRef.current?.unload();
    };
  }, [url]);

  const play = () => {
    console.log('Play clicked, soundRef:', soundRef.current); // Check if sound exists
    if (soundRef.current) {
      soundRef.current.play();
    } else {
      console.error('No sound instance to play');
    }
  };

  const pause = () => {
    console.log('Pause clicked');
    soundRef.current?.pause();
  };

  return (
    <div className="mt-2">
      <button onClick={play} className="bg-green-500 text-white px-4 py-2 rounded mr-2">Play</button>
      <button onClick={pause} className="bg-red-500 text-white px-4 py-2 rounded">Pause</button>
    </div>
  );
}