'use client';
import { useState } from 'react';
import styles from './TimeSelector.module.css';

const TimeSelector = ({ onTimeRangeChange, maxDays = 365 }) => {
  const [selectedRange, setSelectedRange] = useState('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const presetRanges = [
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
    { value: '180', label: '6 months' },
    { value: '365', label: '1 year' },
    { value: 'custom', label: 'Custom' },
  ];

  const handleRangeChange = (value) => {
    setSelectedRange(value);
    setIsCustom(value === 'custom');
    
    if (value !== 'custom') {
      const endDate = new Date();
      const startDate = new Date();
      const days = parseInt(value);
      startDate.setDate(endDate.getDate() - days);
      
      onTimeRangeChange({
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        period: 'day'
      });
    }
  };

  const handleCustomRangeApply = () => {
    if (customStart && customEnd) {
      const startDate = new Date(customStart);
      const endDate = new Date(customEnd);
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > maxDays) {
        alert(`Date range cannot exceed ${maxDays} days`);
        return;
      }
      
      onTimeRangeChange({
        start_date: customStart,
        end_date: customEnd,
        period: 'day'
      });
    }
  };

  return (
    <div className={styles.timeSelector}>
      <div className={styles.presetButtons}>
        {presetRanges.map((range) => (
          <button
            key={range.value}
            className={`${styles.presetButton} ${selectedRange === range.value ? styles.active : ''}`}
            onClick={() => handleRangeChange(range.value)}
          >
            {range.label}
          </button>
        ))}
      </div>
      
      {isCustom && (
        <div className={styles.customRange}>
          <div className={styles.dateInputs}>
            <div className={styles.dateInput}>
              <label>Start Date:</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className={styles.dateInput}>
              <label>End Date:</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                min={customStart}
              />
            </div>
          </div>
          <button 
            className={styles.applyButton}
            onClick={handleCustomRangeApply}
            disabled={!customStart || !customEnd}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

export default TimeSelector;
