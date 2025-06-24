'use client';
import DawInterface from '../../components/DAW/DawInterface';

export default function Upload() {
  return (
    <div>
      <div className="about-header">
        <h1 className="about-title">Create & Upload</h1>
        <p className="about-subtitle">Record your music or upload audio files to share with the community</p>
      </div>
      <DawInterface isCollab={false} />
    </div>
  );
}