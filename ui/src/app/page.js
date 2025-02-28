'use client';
import { useEffect, useState } from 'react';
import api from '../lib/api';
import TrackPlayer from '../components/TrackPlayer';

export default function Home() {
  const [tracks, setTracks] = useState([]);

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        const response = await api.get('/tracks');
        setTracks(response.data);
      } catch (err) {
        console.error('Failed to fetch tracks:', err);
      }
    };
    fetchTracks();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">All Tracks</h1>
      {tracks.length === 0 ? (
        <p>No tracks yet.</p>
      ) : (
        <ul className="space-y-4">
          {tracks.map((track) => (
            <li key={track.id} className="bg-white p-4 rounded shadow">
              <h2 className="text-lg font-semibold">{track.title}</h2>
              <TrackPlayer audioUrl={`${process.env.NEXT_PUBLIC_API_URL}${track.audio_url}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}