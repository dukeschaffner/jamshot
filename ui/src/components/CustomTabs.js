'use client';

import { useState, useEffect } from 'react';
import styles from '../app/Home.module.css';

export default function CustomTabs({ 
  tabs, 
  activeTab, 
  onTabChange, 
  variant = 'default',
  className = '' 
}) {
  // Determine CSS classes based on variant
  const getContainerClass = () => {
    switch (variant) {
      case 'feed':
        return styles.feedTabs;
      case 'track':
        return 'track-tabs';
      default:
        return 'custom-tabs';
    }
  };

  const getTabClass = (isActive) => {
    switch (variant) {
      case 'feed':
        return `${styles.feedTab} ${isActive ? `${styles.active}` : ''}`;
      case 'track':
        return `track-tab ${isActive ? 'active' : ''}`;
      default:
        return `tab ${isActive ? 'active' : ''}`;
    }
  };

  return (
    <div className={`${getContainerClass()} ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={getTabClass(activeTab === tab.key)}
          onClick={() => onTabChange(tab.key)}
          disabled={tab.disabled}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
} 