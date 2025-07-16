'use client';
import DawInterface from '../../components/DAW/DawInterface';
import { FaDesktop } from 'react-icons/fa';
import { useMobile } from '../../contexts/MobileContext';

export default function Upload() {
  const { isMobile } = useMobile();

  return (
    <div>
      <div className="about-header">
        <h1 className="about-title">Create & Upload</h1>
        <p className="about-subtitle">Record your music or upload audio files to share with the community</p>
      </div>
      {isMobile ? (
        <div className="mobile-collab-message">
          <FaDesktop className="mobile-collab-icon" />
          <h3>Desktop Required</h3>
          <p>Use Desktop version to record or upload file to collaborate</p>
        </div>
      ) : (
        <DawInterface isCollab={false} />
      )}
    </div>
  );
}