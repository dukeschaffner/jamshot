'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FaTrophy, FaCalendarAlt, FaDollarSign, FaPlay, FaPause, FaUsers, FaClock, FaExternalLinkAlt } from 'react-icons/fa';
import { competitionApi } from '../lib/api';
import { formatCompetitionDateRange } from '@sterio/formatting-utils';
import { useUser } from '../contexts/UserContext';
import { useAudio } from '../lib/AudioContext';
import styles from './SponsoredCompetition.module.css';

export default function SponsoredCompetition({ 
  variant = 'sidebar', // 'sidebar', 'banner'
  className = '',
  setHasSponsoredCompetition
}) {
  const router = useRouter();
  const { isAuthenticated } = useUser();
  const { currentTrack, isPlaying, playTrack, togglePlayPause, setDiscoveryMethod } = useAudio();
  const [competition, setCompetition] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSponsoredCompetition();
  }, []);

  const loadSponsoredCompetition = async () => {
    let hasSponsoredCompetition = false;
    try {
      setLoading(true);
      const response = await competitionApi.getSponsoredCompetition();
      setCompetition(response.data.competition);
      if (response.data.competition) {
        hasSponsoredCompetition = true;
      }
    } catch (err) {
      console.error('Error loading sponsored competition:', err);
      setCompetition(null);
    } finally {
      setLoading(false);
      if(setHasSponsoredCompetition) {
        setHasSponsoredCompetition(hasSponsoredCompetition);
      }
    }
  };

  const handlePlayPause = () => {
    if (!competition) return;

    // Check if this sponsored competition track is currently playing
    const isCurrentTrack = currentTrack?.id === competition.track.id;
    
    if (isCurrentTrack) {
      // If it's the current track, just toggle play/pause
      togglePlayPause();
    } else {
      // If it's a different track, start playing this one
      // Set discovery method for analytics
      setDiscoveryMethod('sponsored_competition');
      
      // Play the track without adding any playlist (as requested - don't playlist any songs)
      playTrack(competition.track, []);
    }
  };

  const handleViewCompetition = () => {
    if (competition) {
      router.push(`/competition/${competition.id}`);
    }
  };

  const handleEnterCompetition = () => {
    if (competition) {
      router.push(`/track/${competition.track.guid}`);
    }
  };

  // Don't render if no sponsored competition or still loading
  if (loading || !competition) {
    return null;
  }

  const getVariantClass = () => {
    switch (variant) {
      case 'banner':
        return styles.banner;
      case 'sidebar':
      default:
        return styles.sidebar;
    }
  };

  const now = new Date();
  const startDate = new Date(competition.startdate);
  const endDate = new Date(competition.enddate);
  const isActive = now >= startDate && now <= endDate;
  const isUpcoming = now < startDate;
  const hasEnded = now > endDate;

  // Check if this competition track is currently playing
  const isCurrentTrack = currentTrack?.id === competition.track.id;
  const isTrackPlaying = isCurrentTrack && isPlaying;

  return (
    <div className={`${styles.sponsoredCompetition} ${getVariantClass()} ${className}`}>
      {/* Sponsored Badge */}
      <div className={styles.sponsoredBadge}>
        <FaTrophy className={styles.badgeIcon} />
        Sponsored Competition
      </div>

      {/* Sponsor Branding */}
      {competition.sponsor_name && (
        <div className={styles.sponsorBranding}>
          {competition.image_url && (
            <img 
              src={competition.image_url} 
              alt={`${competition.sponsor_name} logo`}
              className={styles.sponsorLogo}
            />
          )}
          <span className={styles.sponsorName}>Sponsored by {competition.sponsor_name}</span>
        </div>
      )}

      {/* Competition Content */}
      <div className={styles.content}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            {competition.title || competition.track.title}
          </h3>
          
          {/* Status Badge */}
          <div className={`${styles.statusBadge} ${
            isActive ? styles.active : 
            isUpcoming ? styles.upcoming : 
            styles.ended
          }`}>
            {isActive && <><FaPlay className={styles.statusIcon} /> Active</>}
            {isUpcoming && <><FaClock className={styles.statusIcon} /> Upcoming</>}
            {hasEnded && <>Ended</>}
          </div>
        </div>

        {competition.description && (
          <p className={styles.description}>{competition.description}</p>
        )}

        {/* Competition Info */}
        <div className={styles.info}>
          <div className={styles.infoItem}>
            <FaCalendarAlt className={styles.infoIcon} />
            <span>{formatCompetitionDateRange(competition.startdate, competition.enddate)}</span>
          </div>

          {competition.prize_amount && (
            <div className={styles.infoItem}>
              <FaDollarSign className={styles.infoIcon} />
              <span>${competition.prize_amount} Prize</span>
            </div>
          )}

          <div className={styles.infoItem}>
            <FaUsers className={styles.infoIcon} />
            <span>{competition.entry_count || 0} Entries</span>
          </div>
        </div>

        {/* Track Preview */}
        <div className={styles.trackPreview}>
          <button 
            className={styles.playButton}
            onClick={handlePlayPause}
            aria-label={isTrackPlaying ? 'Pause' : 'Play'}
          >
            {isTrackPlaying ? <FaPause /> : <FaPlay />}
          </button>
          <div className={styles.trackInfo}>
            <span className={styles.trackTitle}>{competition.track.title}</span>
            <span className={styles.trackArtist}>by @{competition.track.username}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.actions}>
          <button 
            className={`pill-btn ${styles.viewButton}`}
            onClick={handleViewCompetition}
          >
            <FaExternalLinkAlt />
            View Details
          </button>
          
          {isAuthenticated && isActive && !competition.has_entered && (
            <button 
              className={`pill-btn gradient-btn ${styles.enterButton}`}
              onClick={handleEnterCompetition}
            >
              <FaTrophy />
              Enter Competition
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
