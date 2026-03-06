import React from 'react';

export default function FaDrumKit(props) {
  return (
    <svg 
      stroke="currentColor" 
      fill="currentColor" 
      strokeWidth="0" 
      viewBox="0 0 512 512" 
      height="1em" 
      width="1em" 
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Bass Drum (Center) */}
      <path d="M256 464c-61.9 0-112-50.1-112-112s50.1-112 112-112 112 50.1 112 112-50.1 112-112 112z" />
      {/* Inner ring for Bass Drum to give it detail - Using a path that creates a donut if we wanted, but let's just make it simple solid */}
      
      {/* Left Tom */}
      <path d="M156 186l80 16v64l-80-16v-64z" />
      <ellipse cx="196" cy="194" rx="41" ry="15" transform="rotate(11 196 194)" />
      
      {/* Right Tom */}
      <path d="M276 202l80-16v64l-80 16v-64z" />
      <ellipse cx="316" cy="194" rx="41" ry="15" transform="rotate(-11 316 194)" />
      
      {/* Left Cymbal */}
      <path d="M76 210h16v160H76z" />
      <ellipse cx="84" cy="190" rx="60" ry="12" transform="rotate(-15 84 190)" />
      
      {/* Right Cymbal/Hi-Hat */}
      <path d="M420 210h16v160h-16z" />
      <ellipse cx="428" cy="190" rx="48" ry="10" />
      <ellipse cx="428" cy="180" rx="48" ry="10" />
      
      {/* Pedals/Stands feet */}
      <path d="M220 470h72v16h-72z" />
      <path d="M50 370h68v12H50z" />
      <path d="M394 370h68v12h-68z" />
    </svg>
  );
}

