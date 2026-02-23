import styles from './PlayingIndicator.module.css';

export default function PlayingIndicator({ size = 16, className = '', color }) {
  const barWidth = Math.max(2, size / 6);
  const barGap = Math.max(2, size / 8);
  const containerHeight = size;
  
  const barStyle = {
    width: `${barWidth}px`,
    height: `${containerHeight}px`,
  };
  
  // If color is provided, override the default styling
  if (color) {
    barStyle.backgroundColor = color;
    barStyle.boxShadow = color === 'black' || color === '#000' || color === '#000000'
      ? '0 0 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.5)'
      : `0 0 4px ${color}80, 0 0 8px ${color}50`;
  }
  
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
        style={barStyle}
      />
      <div 
        className={styles.bar}
        style={barStyle}
      />
      <div 
        className={styles.bar}
        style={barStyle}
      />
    </div>
  );
}

