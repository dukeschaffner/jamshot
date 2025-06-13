'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaBars, FaInfoCircle, FaQuestionCircle } from 'react-icons/fa';

export default function MoreDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const router = useRouter();


  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  return (
    <div className="relative notification-dropdown" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="notification-button"
        title="Notifications"
      >
        <FaBars size={20} />
        More
      </button>

      {isOpen && (
        <div className="notification-panel">
          <div className="more-dropdown-header">
          </div>
          <div className="notification-body">
            <Link className="nav-link" href="/about" onClick={() => setIsOpen(false)}><FaInfoCircle />About</Link>
            <Link className="nav-link" href="/faq" onClick={() => setIsOpen(false)}><FaQuestionCircle />FAQ</Link>
          </div>
        </div>
      )}
    </div>
  );
} 