import React from 'react';

const CountInIcon = ({ isEnabled }) => {
  // SVG will inherit color from parent component via 'currentColor'
  
  return (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
      {/* Rounded square background */}
      <rect width="512" height="512" rx="80" ry="80" fill="currentColor" opacity={isEnabled ? "1.0" : "0.5"}/>
      
      {/* Numbers arranged in two rows */}
      <g fontFamily="Arial, sans-serif" fontWeight="900" fill="white" textAnchor="middle">
        {/* Top row: 1 and 2 */}
        <text x="180" y="230" fontSize="160">1</text>
        <text x="340" y="230" fontSize="160">2</text>
        
        {/* Bottom row: 3 and 4 */}
        <text x="180" y="390" fontSize="160">3</text>
        <text x="340" y="390" fontSize="160">4</text>
      </g>
    </svg>
  );
};

export default CountInIcon; 