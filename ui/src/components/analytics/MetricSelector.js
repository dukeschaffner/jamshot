'use client';
import { useState } from 'react';
import styles from './MetricSelector.module.css';

const MetricSelector = ({
  onMetricChange,
  onFilterChange,
  availableMetrics = [],
  showCountryFilter = false,
  selectedMetric = 'plays',
  availableCountries = []
}) => {
  const [selectedFilter, setSelectedFilter] = useState('');

  const defaultMetrics = [
    { value: 'plays', label: 'Plays', icon: '▶️' },
    { value: 'listeners', label: 'Listeners', icon: '👥' },
    { value: 'likes', label: 'Likes', icon: '❤️' },
    { value: 'comments', label: 'Comments', icon: '💬' },
    { value: 'reposts', label: 'Reposts', icon: '🔄' },
    { value: 'shares', label: 'Shares', icon: '📤' },
    { value: 'collaborations', label: 'Collaborations', icon: '🤝' },
  ];

  const metrics = availableMetrics.length > 0 ? availableMetrics : defaultMetrics;

  const handleMetricChange = (metric) => {
    onMetricChange(metric);
  };

  const handleFilterChange = (filter) => {
    setSelectedFilter(filter);
    onFilterChange(filter);
  };

  return (
    <div className={styles.metricSelector}>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Metric</h4>
        <div className={styles.metricButtons}>
          {metrics.map((metric) => (
            <button
              key={metric.value}
              className={`${styles.metricButton} ${selectedMetric === metric.value ? styles.active : ''}`}
              onClick={() => handleMetricChange(metric.value)}
            >
              <span className={styles.metricIcon}>{metric.icon}</span>
              <span className={styles.metricLabel}>{metric.label}</span>
            </button>
          ))}
        </div>
      </div>

      {showCountryFilter && (selectedMetric === 'plays' || selectedMetric === 'listeners') && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Filter by Country</h4>
          <div className={styles.filterGroup}>
            <select
              value={selectedFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className={styles.countrySelect}
            >
              <option value="">All Countries</option>
              {availableCountries
                .filter((country, index, self) =>
                  index === self.findIndex(c => c.country_code === country.country_code)
                )
                .sort((a, b) => a.country.localeCompare(b.country))
                .map(country => (
                  <option key={country.country_code} value={country.country_code}>
                    {country.country}
                  </option>
                ))}
            </select>
            {selectedFilter && (
              <button
                className={styles.clearFilter}
                onClick={() => handleFilterChange('')}
              >
                Clear Filter
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricSelector;
