'use client';
import React from 'react';
import { FaClock } from 'react-icons/fa';
import { formatDistanceToNow } from 'date-fns';

export default function TimeDisplay({ timestamp, className = '' }) {
  // Format the timestamp to show relative time (e.g., "5 days ago")
  const formattedTime = formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  
  return (
    <div className={`time-display ${className}`}>
      <FaClock className="time-icon" />
      <span className="time-text">{formattedTime}</span>
    </div>
  );
} 