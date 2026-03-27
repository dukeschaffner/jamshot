'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Popover from './Popover';
import FaLoop from './icons/FaLoop';

export default function LoopIconWithPopover({ track, className = '' }) {
  const router = useRouter();
  const anchorRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  if (!track?.is_loop) return null;

  const handleClick = (e) => {
    e.stopPropagation();
    if (track?.guid) router.push(`/tree/${track.guid}`);
  };

  return (
    <>
      <div
        ref={anchorRef}
        className={className}
        onClick={handleClick}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick(e);
        }}
      >
        <FaLoop className="shrink-0" />
      </div>

      <Popover
        isVisible={isVisible}
        anchorElement={anchorRef.current}
        className="text-grey-3 text-sm"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        <div style={{ maxWidth: 260 }}>
          This is a loop track. Click to go to the explore tree page in loop mode
        </div>
      </Popover>
    </>
  );
}

