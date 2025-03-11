'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchTrack } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import CollabInterface from '@/components/CollabInterface';
import './collaborate.css';

export default function CollaboratePage() {
  const { trackId } = useParams();
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret');
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadTrack() {
      try {
        setLoading(true);
        const data = await fetchTrack(trackId, secret);
        console.log('Track data loaded:', data);
        // Since fetchTrack returns an array, we take the first track
        const mainTrack = Array.isArray(data) && data.length > 0 ? data[0] : null;
        if (!mainTrack) {
          throw new Error('Track not found');
        }
        setTrack(mainTrack);
        setLoading(false);
      } catch (err) {
        console.error('Error loading track:', err);
        if (err.response && err.response.status === 403) {
          setError('This track is private. You do not have permission to view it.');
        } else {
          setError('Failed to load track. Please try again later.');
        }
        setLoading(false);
      }
    }

    if (trackId) {
      loadTrack();
    }
  }, [trackId, secret]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500 mb-4">{error}</div>
        <Link href="/" className="text-primary hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="mb-4">Track not found</div>
        <Link href="/" className="text-primary hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      <CollabInterface track={track} />
    </div>
  );
} 