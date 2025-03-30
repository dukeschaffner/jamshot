'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchTrack } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import DawInterface from '@/components/DawInterface';
import './collaborate.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlay, faPause, faStepBackward, faStepForward, 
  faDrum, faMicrophone, faTrash, faUpload, faCloudUploadAlt,
  faHeart, faComment, faCircle, faStop, faCog
} from '@fortawesome/free-solid-svg-icons';

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
        <div className="track-header">
         <div className="track-info">
           <h1 className="track-title">{track?.title || 'Untitled Track'}</h1>
           <div className="track-artist">
             <div className="artist-avatar">
               <img src={track?.profile_pic_url || '/placeholder-avatar.png'} alt="Artist Avatar" />
             </div>
             <span className="artist-name">{track?.username || 'Unknown Artist'}</span>
             {track?.verified && <span className="verified-badge">✓</span>}
           </div>
           <div className="track-meta">
             <span className="meta-item"><FontAwesomeIcon icon={faPlay} /> {track?.play_count || 0}</span>
             <span className="meta-item"><FontAwesomeIcon icon={faHeart} /> {track?.like_count || 0}</span>
             <span className="meta-item"><FontAwesomeIcon icon={faComment} /> {track?.collab_count || 0} collabs</span>
           </div>
         </div>
      </div>
      <DawInterface track={track} isCollab={true} />
    </div>
  );
} 