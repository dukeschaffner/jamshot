import React from 'react';

const CountInIcon = ({ isEnabled }) => {
  // Use seafoam color (#66CDAA) if enabled, otherwise use grey (#808080)
  const backgroundColor = isEnabled ? "#66CDAA" : "#808080";
  
  return (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
      <rect width="512" height="512" rx="64" ry="64" fill={backgroundColor}/>
      <g fontFamily="Arial, sans-serif" fontWeight="bold" textAnchor="middle" fill="white">
        {/* "1" with metronome tick mark above it */}
        <text x="128" y="300" fontSize="100">1</text>
        <line x1="128" x2="128" y1="120" y2="150" stroke="white" strokeWidth="16" strokeLinecap="round"/>
        
        {/* "2" with metronome tick mark above it */}
        <text x="218" y="300" fontSize="100">2</text>
        <line x1="218" x2="218" y1="120" y2="150" stroke="white" strokeWidth="16" strokeLinecap="round"/>
        
        {/* "3" with metronome tick mark above it */}
        <text x="308" y="300" fontSize="100">3</text>
        <line x1="308" x2="308" y1="120" y2="150" stroke="white" strokeWidth="16" strokeLinecap="round"/>
        
        {/* "4" with metronome tick mark above it */}
        <text x="398" y="300" fontSize="100">4</text>
        <line x1="398" x2="398" y1="120" y2="150" stroke="white" strokeWidth="16" strokeLinecap="round"/>
        
        {/* Bottom metronome bar */}
        <line x1="128" x2="398" y1="370" y2="370" stroke="white" strokeWidth="12" strokeLinecap="round"/>
      </g>
    </svg>
  );
};

export default CountInIcon; 