import styles from './PlayingIndicator.module.css';

export default function PlayingIndicator({ size = 16, className = '' }) {
  const barWidth = Math.max(2, size / 6);
  const barGap = Math.max(2, size / 8);
  const containerHeight = size;
  
  return (
    <div 
      className={`${styles.container} ${className}`}
      style={{
        height: `${containerHeight}px`,
        gap: `${barGap}px`,
      }}
    >
      <div 
        className={styles.bar}
        style={{
          width: `${barWidth}px`,
          height: `${containerHeight}px`,
        }}
      />
      <div 
        className={styles.bar}
        style={{
          width: `${barWidth}px`,
          height: `${containerHeight}px`,
        }}
      />
      <div 
        className={styles.bar}
        style={{
          width: `${barWidth}px`,
          height: `${containerHeight}px`,
        }}
      />
    </div>
  );
}

