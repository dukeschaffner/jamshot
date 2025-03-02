'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '../../../lib/api';
import Track from '../../../components/Track';
import Cookies from 'js-cookie';

export default function UserPage() {
  const { userId } = useParams();
  const router = useRouter();
  const [tracks, setTracks] = useState([]);
  const [repostedTracks, setRepostedTracks] = useState([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, isFollowing: false });
  const [loading, setLoading] = useState(true);
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [activeTab, setActiveTab] = useState('tracks');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tracksResponse, repostsResponse, statsResponse] = await Promise.all([
          api.get(`/users/${userId}/tracks`),
          api.get(`/users/${userId}/reposts`),
          api.get(`/users/${userId}/stats`),
        ]);
        setTracks(tracksResponse.data);
        setRepostedTracks(repostsResponse.data);
        setStats(statsResponse.data);
      } catch (err) {
        console.error('Failed to fetch user data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

  const handleFollow = async () => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }
    try {
      if (stats.isFollowing) {
        await api.delete(`/users/follow/${userId}`);
        setStats(prev => ({ ...prev, isFollowing: false, followers: prev.followers - 1 }));
      } else {
        await api.post(`/users/follow/${userId}`);
        setStats(prev => ({ ...prev, isFollowing: true, followers: prev.followers + 1 }));
      }
    } catch (err) {
      console.error('Follow/unfollow error:', err);
      alert('Failed to update follow status');
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">User {userId}</h1>
        <div className="flex items-center space-x-4 mt-2">
          <p className="text-sm text-gray-600">Followers: {stats.followers}</p>
          <p className="text-sm text-gray-600">Following: {stats.following}</p>
          <button
            onClick={handleFollow}
            className={`px-4 py-2 rounded text-white ${
              stats.isFollowing ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {stats.isFollowing ? 'Unfollow' : 'Follow'}
          </button>
        </div>
      </div>
      
      <div className="mb-4 border-b border-gray-200">
        <nav className="flex space-x-4">
          <button
            onClick={() => setActiveTab('tracks')}
            className={`py-2 px-4 ${
              activeTab === 'tracks'
                ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Tracks
          </button>
          <button
            onClick={() => setActiveTab('reposts')}
            className={`py-2 px-4 ${
              activeTab === 'reposts'
                ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Reposts
          </button>
        </nav>
      </div>
      
      {activeTab === 'tracks' && (
        <>
          <h2 className="text-xl font-semibold mb-4">Tracks</h2>
          {tracks.length === 0 ? (
            <p>No tracks yet.</p>
          ) : (
            <ul className="space-y-4">
              {tracks.map(track => (
                <li key={track.id}>
                  <Track
                    track={track}
                    allTracks={tracks}
                    expandedTrackId={expandedTrackId}
                    setExpandedTrackId={setExpandedTrackId}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      
      {activeTab === 'reposts' && (
        <>
          <h2 className="text-xl font-semibold mb-4">Reposts</h2>
          {repostedTracks.length === 0 ? (
            <p>No reposts yet.</p>
          ) : (
            <ul className="space-y-4">
              {repostedTracks.map(track => (
                <li key={track.id}>
                  <Track
                    track={track}
                    allTracks={repostedTracks}
                    expandedTrackId={expandedTrackId}
                    setExpandedTrackId={setExpandedTrackId}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}