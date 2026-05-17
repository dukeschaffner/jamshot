export default function BetaSupporterBadge({
  title = 'User is a beta supporter',
  className = '',
  variant = 'inline', // 'inline' | 'icon' | 'overlay'
  size = 'md', // 'md' | 'sm' (only affects overlay)
  tight = false,
}) {
  const styles = require('./BetaSupporterBadge.module.css');

  const classes = [styles.badge];
  if (variant === 'icon') classes.push(styles.icon);
  if (variant === 'overlay') classes.push(styles.overlay);
  if (variant === 'overlay' && size === 'sm') classes.push(styles.overlaySm);
  if (tight) classes.push(styles.tight);
  if (className) classes.push(className);

  return (
    <span
      className={classes.join(' ').trim()}
      title={title}
      aria-label={title}
    >
      ★
    </span>
  );
}

