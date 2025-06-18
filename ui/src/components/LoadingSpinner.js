import { FaSpinner } from 'react-icons/fa';

export default function LoadingSpinner({ size = 'medium', className = '', style = {} }) {
  const sizeClasses = {
    small: 'spinner-small',
    medium: 'spinner-medium', 
    large: 'spinner-large'
  };

  return (
    <div className={`loading-spinner ${className}`} style={style}>
      <FaSpinner className={`spinner-icon ${sizeClasses[size]}`} />
    </div>
  );
} 