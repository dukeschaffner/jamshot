'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDuration } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone } from '@fortawesome/free-solid-svg-icons';

export default function TracksWidget({ 
  track,
  isPlaying,
  isLooping,
  playheadPos,
  looperLeftPos,
  looperRightPos,
  trackDuration,
  setPlayheadPos,
  setLooperLeftPos,
  setLooperRightPos,
  setIsLooping,
  audioRef,
  showCollabModal,
  posToTime,
  timeToPos
}) {
  // State for dragging
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingLooperLeft, setIsDraggingLooperLeft] = useState(false);
  const [isDraggingLooperRight, setIsDraggingLooperRight] = useState(false);
  const [isDraggingLooperRegion, setIsDraggingLooperRegion] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [looperStartWidth, setLooperStartWidth] = useState(0);
  const [looperStartLeft, setLooperStartLeft] = useState(0);
  
  // Refs
  const waveformContainerRef = useRef(null);
  const playheadRef = useRef(null);
  const looperRef = useRef(null);
  const looperHandleLeftRef = useRef(null);
  const looperHandleRightRef = useRef(null);
  const looperRegionRef = useRef(null);
  
  // Show time tooltip
  const showTimeTooltip = (element, position, customText) => {
    if (!element) return;
    
    let tooltip = document.querySelector('.time-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'time-tooltip';
      document.body.appendChild(tooltip);
    }
    
    const time = customText || formatDuration(posToTime(position, trackDuration));
    tooltip.textContent = time;
    
    if (waveformContainerRef.current) {
      const rect = waveformContainerRef.current.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      
      // Position tooltip above the element
      const tooltipLeft = rect.left + (position / 100) * rect.width;
      tooltip.style.left = `${tooltipLeft}px`;
      tooltip.style.top = `${elementRect.top - 25}px`;
      tooltip.style.display = 'block';
    }
  };
  
  // Hide time tooltip
  const hideTimeTooltip = () => {
    const tooltip = document.querySelector('.time-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  };
  
  // Update visual elements based on state
  const updateVisuals = () => {
    if (playheadRef.current) {
      playheadRef.current.style.left = `${playheadPos}%`;
    }
    
    if (looperRef.current) {
      const looperWidth = looperRightPos - looperLeftPos;
      looperRef.current.style.left = `${looperLeftPos}%`;
      looperRef.current.style.width = `${looperWidth}%`;
    }
    
    if (looperRegionRef.current) {
      if (isLooping) {
        looperRegionRef.current.style.backgroundColor = 'rgba(147, 233, 190, 0.4)';
        if (looperHandleLeftRef.current) looperHandleLeftRef.current.style.backgroundColor = 'var(--seafoam)';
        if (looperHandleRightRef.current) looperHandleRightRef.current.style.backgroundColor = 'var(--seafoam)';
      } else {
        looperRegionRef.current.style.backgroundColor = 'rgba(147, 233, 190, 0.1)';
        if (looperHandleLeftRef.current) looperHandleLeftRef.current.style.backgroundColor = 'var(--gray)';
        if (looperHandleRightRef.current) looperHandleRightRef.current.style.backgroundColor = 'var(--gray)';
      }
    }
    
    // Update time tooltips if dragging
    if (isDraggingLooperLeft && looperHandleLeftRef.current) {
      showTimeTooltip(looperHandleLeftRef.current, looperLeftPos);
    } else if (isDraggingLooperRight && looperHandleRightRef.current) {
      showTimeTooltip(looperHandleRightRef.current, looperRightPos);
    } else if (isDraggingPlayhead && playheadRef.current) {
      showTimeTooltip(playheadRef.current, playheadPos);
    } else if (isDraggingLooperRegion && looperRegionRef.current) {
      const looperStartTime = posToTime(looperLeftPos, trackDuration);
      const looperEndTime = posToTime(looperRightPos, trackDuration);
      showTimeTooltip(
        looperRegionRef.current, 
        (looperLeftPos + looperRightPos) / 2, 
        `${formatDuration(looperStartTime)} - ${formatDuration(looperEndTime)}`
      );
    }
  };
  
  // Handle waveform click
  const handleWaveformClick = (e) => {
    if (!waveformContainerRef.current || !audioRef.current) return;
    
    const rect = waveformContainerRef.current.getBoundingClientRect();
    const clickPos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    
    // Update playhead position
    setPlayheadPos(clickPos);
    
    // Update audio position
    const newTime = posToTime(clickPos, audioRef.current.duration);
    audioRef.current.currentTime = newTime;
  };
  
  // Mouse down handlers for dragging
  const handlePlayheadMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
  };
  
  const handleLooperLeftMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingLooperLeft(true);
  };
  
  const handleLooperRightMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingLooperRight(true);
  };
  
  const handleLooperRegionMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingLooperRegion(true);
    setDragStartX(e.clientX);
    setLooperStartLeft(looperLeftPos);
    // Store the width of the looper region
    setLooperStartWidth(looperRightPos - looperLeftPos);
  };
  
  // Update visuals when state changes
  useEffect(() => {
    updateVisuals();
  }, [
    playheadPos, looperLeftPos, looperRightPos, isLooping,
    isDraggingLooperLeft, isDraggingLooperRight, isDraggingPlayhead, isDraggingLooperRegion
  ]);
  
  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingLooperLeft && !isDraggingLooperRight && !isDraggingPlayhead && !isDraggingLooperRegion) return;
      
      if (waveformContainerRef.current) {
        const rect = waveformContainerRef.current.getBoundingClientRect();
        const mousePos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        // Dragging playhead
        if (isDraggingPlayhead && audioRef.current) {
          setPlayheadPos(mousePos);
          const newTime = posToTime(mousePos, audioRef.current.duration);
          audioRef.current.currentTime = newTime;
          
          // Show time tooltip
          showTimeTooltip(playheadRef.current, mousePos, formatDuration(newTime));
        }
        
        // Dragging left looper handle
        if (isDraggingLooperLeft) {
          const newLeftPos = Math.max(0, Math.min(looperRightPos - 5, mousePos));
          setLooperLeftPos(newLeftPos);
          
          // If playhead is to the left of the new left position and audio is playing,
          // move the playhead to the new left position
          if (playheadPos < newLeftPos && isPlaying && audioRef.current) {
            setPlayheadPos(newLeftPos);
            audioRef.current.currentTime = posToTime(newLeftPos, audioRef.current.duration);
          }
          
          // Show time tooltip
          if (audioRef.current) {
            const time = posToTime(newLeftPos, audioRef.current.duration);
            showTimeTooltip(looperHandleLeftRef.current, newLeftPos, formatDuration(time));
          }
        }
        
        // Dragging right looper handle
        if (isDraggingLooperRight) {
          const newRightPos = Math.max(looperLeftPos + 5, Math.min(100, mousePos));
          setLooperRightPos(newRightPos);
          
          // Show time tooltip
          if (audioRef.current) {
            const time = posToTime(newRightPos, audioRef.current.duration);
            showTimeTooltip(looperHandleRightRef.current, newRightPos, formatDuration(time));
          }
        }
        
        // Dragging entire looper region
        if (isDraggingLooperRegion) {
          const deltaX = e.clientX - dragStartX;
          const deltaPercent = (deltaX / rect.width) * 100;
          
          // Calculate new positions
          let newLeftPos = looperStartLeft + deltaPercent;
          let newRightPos = newLeftPos + looperStartWidth;
          
          // Ensure the looper stays within bounds
          if (newLeftPos < 0) {
            newLeftPos = 0;
            newRightPos = looperStartWidth;
          }
          
          if (newRightPos > 100) {
            newRightPos = 100;
            newLeftPos = 100 - looperStartWidth;
          }
          
          // Update looper positions
          setLooperLeftPos(newLeftPos);
          setLooperRightPos(newRightPos);
          
          // If playhead is outside the new looper region and audio is playing,
          // move the playhead to the new left position
          if (isPlaying && audioRef.current && isLooping) {
            if (playheadPos < newLeftPos || playheadPos > newRightPos) {
              setPlayheadPos(newLeftPos);
              audioRef.current.currentTime = posToTime(newLeftPos, audioRef.current.duration);
            }
          }
          
          // Show tooltip with start and end times
          if (audioRef.current) {
            const looperStartTime = posToTime(newLeftPos, audioRef.current.duration);
            const looperEndTime = posToTime(newRightPos, audioRef.current.duration);
            showTimeTooltip(
              looperRegionRef.current, 
              (newLeftPos + newRightPos) / 2, 
              `${formatDuration(looperStartTime)} - ${formatDuration(looperEndTime)}`
            );
          }
        }
      }
    };
    
    const handleMouseUp = () => {
      setIsDraggingLooperLeft(false);
      setIsDraggingLooperRight(false);
      setIsDraggingPlayhead(false);
      setIsDraggingLooperRegion(false);
      hideTimeTooltip();
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDraggingLooperLeft, isDraggingLooperRight, isDraggingPlayhead, isDraggingLooperRegion,
    looperLeftPos, looperRightPos, dragStartX, looperStartLeft, looperStartWidth,
    isPlaying, playheadPos, isLooping
  ]);
  
  return (
    <div className="daw-container">
      {/* Timeline */}
      <div className="timeline">
        <div className="track-label"></div>
        <div className="time-markers">
          <div className="time-marker" style={{ left: '0%' }}>0:00</div>
          <div className="time-marker" style={{ left: '16.67%' }}>0:15</div>
          <div className="time-marker" style={{ left: '33.33%' }}>0:30</div>
          <div className="time-marker" style={{ left: '50%' }}>0:45</div>
          <div className="time-marker" style={{ left: '66.67%' }}>1:00</div>
          <div className="time-marker" style={{ left: '83.33%' }}>1:15</div>
          <div className="time-marker" style={{ left: '100%' }}>1:30</div>
        </div>
      </div>

      {/* Parent Track */}
      <div className="track-container parent-track">
        <div className="track-label">
          <span>Original</span>
        </div>
        <div className="waveform-container" ref={waveformContainerRef} onClick={handleWaveformClick}>
          <div className="waveform">
            {/* SVG Waveform */}
            <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
              <path 
                d="M0,50 Q10,40 20,50 T40,50 T60,50 T80,30 T100,50 T120,60 T140,50 T160,40 T180,50 T200,70 T220,50 T240,30 T260,50 T280,60 T300,50 T320,40 T340,50 T360,60 T380,50 T400,30 T420,50 T440,70 T460,50 T480,30 T500,50 T520,60 T540,50 T560,40 T580,50 T600,70 T620,50 T640,30 T660,50 T680,60 T700,50 T720,40 T740,50 T760,60 T780,50 T800,30 T820,50 T840,70 T860,50 T880,30 T900,50 T920,60 T940,50 T960,40 T980,50 T1000,50" 
                fill="none" 
                stroke="var(--seafoam)" 
                strokeWidth="2"
              />
            </svg>
            {/* Playhead */}
            <div 
              className="playhead" 
              ref={playheadRef}
              style={{ left: `${playheadPos}%` }}
              onMouseDown={handlePlayheadMouseDown}
            ></div>
          </div>
          {/* Looper */}
          <div 
            className="looper" 
            ref={looperRef}
            style={{ left: `${looperLeftPos}%`, width: `${looperRightPos - looperLeftPos}%` }}
          >
            <div 
              className="looper-handle left" 
              ref={looperHandleLeftRef}
              onMouseDown={handleLooperLeftMouseDown}
            ></div>
            <div 
              className="looper-region" 
              ref={looperRegionRef}
              onClick={(e) => {
                e.stopPropagation();
                setIsLooping(prev => !prev);
              }}
              onMouseDown={handleLooperRegionMouseDown}
            ></div>
            <div 
              className="looper-handle right" 
              ref={looperHandleRightRef}
              onMouseDown={handleLooperRightMouseDown}
            ></div>
          </div>
        </div>
      </div>

      {/* Your Recording */}
      <div className="track-container your-track">
        <div className="track-label">
          <span>Your Recording</span>
        </div>
        <div 
          className="waveform-container empty"
          onClick={showCollabModal}
        >
          <div className="empty-message">
            <FontAwesomeIcon icon={faMicrophone} />
            <span>Record your collaboration</span>
          </div>
        </div>
      </div>
    </div>
  );
} 