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

// Export lists for different platforms
const API_EXPORTS = [
    validateDateOfBirth
];
  
const UI_EXPORTS = [
    validateDateOfBirth
]; 