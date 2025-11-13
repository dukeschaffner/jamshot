'use client';

import styles from '../app/Home.module.css';
import tabStyles from './CustomTabs.module.css';

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

  const getTabClass = (isActive, isExternal) => {
    const baseClass = isExternal ? tabStyles.externalTab : '';
    switch (variant) {
      case 'feed':
        return `${styles.feedTab} ${isActive ? `${styles.active}` : ''} ${baseClass}`;
      case 'track':
        return `track-tab ${isActive ? 'active' : ''} ${baseClass}`;
      default:
        return `tab ${isActive ? 'active' : ''} ${baseClass}`;
    }
  };

  const handleTabClick = (tab) => {
    if (tab.externalLink) {
      // Handle external link navigation
      if (tab.onExternalClick) {
        tab.onExternalClick();
      } else if (typeof window !== 'undefined') {
        window.location.href = tab.externalLink;
      }
    } else {
      onTabChange(tab.key);
    }
  };

  return (
    <div className={`${getContainerClass()} ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={getTabClass(activeTab === tab.key, !!tab.externalLink)}
          onClick={() => handleTabClick(tab)}
          disabled={tab.disabled}
        >
          {tab.icon && <span className={tabStyles.tabIcon}>{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
} 