/**
 * Validation utilities for Jamshot
 * Shared across web and mobile platforms
 */

/**
 * Validate email address format
 * @param {string} email - Email address to validate
 * @returns {boolean} Whether the email is valid
 */
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validate username format and length
 * @param {string} username - Username to validate
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateUsername = (username) => {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }
  
  const trimmed = username.trim();
  
  // Username length validation: max 20 characters
  if (trimmed.length > 20) {
    return { valid: false, error: 'Username must be 20 characters or less.' };
  }
  
  // Username validation: only allow letters, numbers, and underscores
  if (!/^\w+$/.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores.' };
  }
  
  return { valid: true };
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with valid boolean and error message
 */
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  
  // Password must be at least 8 characters long
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  
  // Password must contain at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  
  // Password must contain at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  
  // Password must contain at least one number
  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  
  // Password must contain at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }
  
  return { valid: true };
};

/**
 * Validate track title
 * @param {string} title - Track title to validate
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateTrackTitle = (title) => {
  if (!title || typeof title !== 'string') {
    return { valid: false, error: 'Track title is required' };
  }
  
  const trimmed = title.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Track title cannot be empty' };
  }
  
  if (trimmed.length > 100) {
    return { valid: false, error: 'Track title must be less than 100 characters' };
  }
  
  return { valid: true };
};

/**
 * Validate comment content
 * @param {string} content - Comment content to validate
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateCommentContent = (content) => {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Comment content is required' };
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Comment cannot be empty' };
  }
  
  if (trimmed.length > 1000) {
    return { valid: false, error: 'Comment must be less than 1000 characters' };
  }
  
  return { valid: true };
};

/**
 * Validate BPM (beats per minute)
 * @param {number} bpm - BPM value to validate
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateBPM = (bpm) => {
  if (typeof bpm !== 'number' || isNaN(bpm)) {
    return { valid: false, error: 'BPM must be a number' };
  }
  
  if (bpm < 60) {
    return { valid: false, error: 'BPM must be at least 60' };
  }
  
  if (bpm > 200) {
    return { valid: false, error: 'BPM must be less than 200' };
  }
  
  return { valid: true };
};

/**
 * Validate time signature
 * @param {string} timeSignature - Time signature to validate
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateTimeSignature = (timeSignature) => {
  const validTimeSignatures = ['4/4', '3/4', '2/4', '6/8', '9/8', '12/8'];
  
  if (!timeSignature || typeof timeSignature !== 'string') {
    return { valid: false, error: 'Time signature is required' };
  }
  
  if (!validTimeSignatures.includes(timeSignature)) {
    return { valid: false, error: 'Invalid time signature' };
  }
  
  return { valid: true };
};

/**
 * Validate audio file duration
 * @param {number} duration - Duration in seconds
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateAudioDuration = (duration) => {
  if (typeof duration !== 'number' || isNaN(duration)) {
    return { valid: false, error: 'Duration must be a number' };
  }

  if (duration <= 0) {
    return { valid: false, error: 'Duration must be greater than 0' };
  }

  if (duration > 300) {
    return { valid: false, error: 'Audio must be less than 5 minutes' };
  }

  return { valid: true };
};

/**
 * Validate audio file size
 * @param {number} fileSize - File size in bytes
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateAudioFileSize = (fileSize) => {
  if (typeof fileSize !== 'number' || isNaN(fileSize)) {
    return { valid: false, error: 'File size must be a number' };
  }

  if (fileSize <= 0) {
    return { valid: false, error: 'File size must be greater than 0' };
  }

  const maxSize = 100 * 1024 * 1024; // 100MB
  if (fileSize > maxSize) {
    return { valid: false, error: 'Audio file must be less than 100MB' };
  }

  return { valid: true };
};

/**
 * Validate user name
 * @param {string} name - User name to validate
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateName = (name) => {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Name is required' };
  }
  
  const trimmed = name.trim();
  
  if (trimmed === '') {
    return { valid: false, error: 'Name is required' };
  }
  
  // Name length validation: max 40 characters
  if (trimmed.length > 40) {
    return { valid: false, error: 'Name must be 40 characters or less.' };
  }
  
  return { valid: true };
};

/**
 * Validate user bio length
 * @param {string} bio - User bio to validate
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateBio = (bio) => {
  if (!bio || typeof bio !== 'string') {
    return { valid: true }; // Bio is optional
  }
  
  const trimmed = bio.trim();
  
  if (trimmed.length > 500) {
    return { valid: false, error: 'Bio must be less than 500 characters' };
  }
  
  return { valid: true };
};

/**
 * Validate date of birth
 * @param {string} dateOfBirth - Date of birth in YYYY-MM-DD format
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateDateOfBirth = (dateOfBirth) => {
  if (!dateOfBirth || typeof dateOfBirth !== 'string') {
    return { valid: false, error: 'Date of birth is required' };
  }
  
  const trimmed = dateOfBirth.trim();
  
  if (trimmed === '') {
    return { valid: false, error: 'Date of birth is required' };
  }
  
  // Validate date format and age
  const birthDate = new Date(trimmed);
  const today = new Date();
  
  // Check if date is valid
  if (isNaN(birthDate.getTime())) {
    return { valid: false, error: 'Invalid date of birth format' };
  }
  
  // Check if date is in the future
  if (birthDate > today) {
    return { valid: false, error: 'Date of birth cannot be in the future' };
  }
  
  // Check if user is at least 13 years old
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const actualAge = (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) ? age - 1 : age;
  
  if (actualAge < 13) {
    return { valid: false, error: 'You must be at least 13 years old to register' };
  }
  
  return { valid: true };
};

/**
 * Validate form data object
 * @param {Object} formData - Form data to validate
 * @param {Object} validationRules - Validation rules for each field
 * @returns {Object} Validation result with valid boolean and field errors
 */
const validateForm = (formData, validationRules) => {
  const errors = {};
  let isValid = true;
  
  for (const [field, rule] of Object.entries(validationRules)) {
    const value = formData[field];
    const validation = rule(value);
    
    if (!validation.valid) {
      errors[field] = validation.error;
      isValid = false;
    }
  }
  
  return { valid: isValid, errors };
};
module.exports = {
  validateEmail,
  validateUsername,
  validatePassword,
  validateTrackTitle,
  validateCommentContent,
  validateBPM,
  validateTimeSignature,
  validateAudioDuration,
  validateAudioFileSize,
  validateName,
  validateBio,
  validateDateOfBirth,
  validateForm
};
