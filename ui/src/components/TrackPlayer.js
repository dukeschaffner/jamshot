'use client';
import { useEffect, useRef } from 'react';
import { Howl } from 'howler';

export default function TrackPlayer({ audioUrl }) {
  const soundRef = useRef(null);

  useEffect(() => {
    soundRef.current = new Howl({
      src: [audioUrl],
      html5: true, // For streaming
    });

    return () => {
      soundRef.current?.unload();
    };
  }, [audioUrl]);

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