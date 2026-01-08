/**
 * Password validation function matching legacy API validation
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with valid boolean and message
 */
export const validatePassword = (password) => {
  // Password must be at least 8 characters long
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  
  // Password must contain at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  
  // Password must contain at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  
  // Password must contain at least one number
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  
  // Password must contain at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  
  return { valid: true };
};

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {Object} Validation result with valid boolean and message
 */
export const validateUsername = (username) => {
  if (!username || username.trim() === '') {
    return { valid: false, message: 'Username is required' };
  }
  
  // Username validation: only allow letters, numbers, and underscores
  if (!/^\w+$/.test(username)) {
    return { valid: false, message: 'Username can only contain letters, numbers, and underscores.' };
  }

  // Username length validation: max 20 characters
  if (username.length > 20) {
    return { valid: false, message: 'Username must be 20 characters or less.' };
  }

  // Prevent using "me" as username
  if (username.toLowerCase() === 'me') {
    return { valid: false, message: 'Username "me" is not allowed' };
  }

  return { valid: true };
};

/**
 * Validate name
 * @param {string} name - Name to validate
 * @returns {Object} Validation result with valid boolean and message
 */
export const validateName = (name) => {
  if (!name || name.trim() === '') {
    return { valid: false, message: 'Name is required' };
  }
  
  // Name length validation: max 40 characters
  if (name.length > 40) {
    return { valid: false, message: 'Name must be 40 characters or less.' };
  }

  return { valid: true };
};

/**
 * Validate email
 * @param {string} email - Email to validate
 * @returns {Object} Validation result with valid boolean and message
 */
export const validateEmail = (email) => {
  if (!email || email.trim() === '') {
    return { valid: false, message: 'Email is required' };
  }
  
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, message: 'Invalid email format' };
  }

  return { valid: true };
};

