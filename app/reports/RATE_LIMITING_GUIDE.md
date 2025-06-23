# Comprehensive Rate Limiting Implementation Guide

## Overview

This document outlines the comprehensive rate limiting implementation for the JamShot API to prevent abuse, DDoS attacks, and ensure fair usage of resources.

## Rate Limiting Strategy

The implementation uses a multi-layered approach with different rate limits for different types of operations:

### 1. Global Rate Limiting
- **Purpose**: Protect against DDoS attacks and general abuse
- **Limit**: 1000 requests per 15 minutes per IP
- **Applied to**: All API endpoints
- **Location**: `index.js` - applied globally

### 2. Progressive Delay (Speed Limiting)
- **Purpose**: Slow down excessive requests rather than blocking them
- **Limit**: 100 requests per 15 minutes without delay, then progressive delay
- **Delay**: 500ms per request after limit, max 10 seconds
- **Applied to**: All API endpoints
- **Location**: `index.js` - applied globally

### 3. Authentication Rate Limiting

#### Basic Auth Limiter
- **Purpose**: Prevent brute force attacks on auth endpoints
- **Limit**: 10 requests per 15 minutes per IP
- **Applied to**: Registration, token refresh
- **Skips**: Successful requests (doesn't count successful logins)

#### Strict Auth Limiter
- **Purpose**: More restrictive protection for login attempts
- **Limit**: 5 requests per hour per IP
- **Applied to**: Login endpoint
- **Skips**: Successful requests

#### Password Reset Limiter
- **Purpose**: Prevent abuse of password reset functionality
- **Limit**: 3 requests per hour per IP
- **Applied to**: Password reset requests

#### Email Verification Limiter
- **Purpose**: Prevent spam through verification emails
- **Limit**: 5 requests per hour per IP
- **Applied to**: Email verification resend requests

### 4. Content Creation Rate Limiting
- **Purpose**: Prevent spam and abuse of content creation
- **Limit**: 50 requests per hour per IP
- **Applied to**: 
  - Track comments
  - Payment checkout sessions
  - Other content creation endpoints

### 5. File Upload Rate Limiting
- **Purpose**: Prevent abuse of resource-intensive upload operations
- **Limit**: 20 uploads per hour per IP
- **Applied to**:
  - Track uploads
  - Profile image uploads

### 6. User Interaction Rate Limiting
- **Purpose**: Prevent automated abuse of social features
- **Limit**: 200 interactions per hour per IP
- **Applied to**:
  - Track likes
  - Track reposts
  - Track shares
  - User follows/unfollows
  - Follow request actions

### 7. Search Rate Limiting
- **Purpose**: Prevent search abuse and resource exhaustion
- **Limit**: 100 searches per hour per IP
- **Applied to**: All search endpoints

### 8. API Endpoint Rate Limiting
- **Purpose**: High-frequency operations protection
- **Limit**: 60 requests per minute per IP
- **Applied to**: Track play recording

### 9. Contact Form Rate Limiting
- **Purpose**: Prevent contact form spam
- **Limit**: 5 submissions per hour per IP
- **Applied to**: Contact form submissions

## Implementation Details

### Middleware Structure
All rate limiters are defined in `api/src/middleware/rateLimiting.js` and exported for use across different routes.

### Error Responses
All rate limiters return consistent error responses with:
- `error`: Description of the limit exceeded
- `message`: User-friendly message
- `retryAfter`: Time in seconds until the user can try again

### Headers
Rate limiting information is included in response headers:
- `RateLimit-Limit`: The rate limit ceiling for that given request
- `RateLimit-Remaining`: The number of requests left for the time window
- `RateLimit-Reset`: The time at which the rate limit window resets

## Route-Specific Applications

### Authentication Routes (`/api/auth`)
- Registration: `authLimiter`
- Login: `strictAuthLimiter`
- Token refresh: `authLimiter`
- Password reset: `passwordResetLimiter`
- Email verification: `emailVerificationLimiter`

### Track Routes (`/api/tracks`)
- Upload: `uploadLimiter`
- Like: `interactionLimiter`
- Comment: `contentCreationLimiter`
- Repost: `interactionLimiter`
- Play recording: `apiEndpointLimiter`
- Share: `interactionLimiter`

### User Routes (`/api/users`)
- Follow/Unfollow: `interactionLimiter`
- Profile image upload: `uploadLimiter`
- Follow request actions: `interactionLimiter`

### Search Routes (`/api/search`)
- All search endpoints: `searchLimiter`

### Contact Routes (`/api/contact`)
- Contact form: `contactLimiter`

### Payment Routes (`/api/payments`)
- Checkout session: `contentCreationLimiter`

## Monitoring and Maintenance

### Adjusting Limits
Rate limits can be adjusted in `rateLimiting.js` based on:
- Application usage patterns
- Server capacity
- Security requirements
- User feedback

### Monitoring
Monitor the following metrics:
- Rate limit hit rates by endpoint
- False positive rates (legitimate users being blocked)
- Attack patterns and effectiveness of current limits

### Redis Integration (Future Enhancement)
For production scalability, consider implementing Redis-based rate limiting:
- Shared rate limit state across multiple server instances
- More sophisticated rate limiting algorithms
- Better performance for high-traffic scenarios

## Security Considerations

### IP-Based Limitations
Current implementation uses IP-based rate limiting, which has limitations:
- Users behind NAT may share limits
- Attackers can use multiple IPs to bypass limits

### Future Enhancements
Consider implementing:
- User-based rate limiting (in addition to IP-based)
- Captcha integration for suspected abuse
- Machine learning-based abuse detection
- Geolocation-based restrictions

## Testing Rate Limits

### Manual Testing
Use tools like `curl` or Postman to test rate limits:

```bash
# Test global rate limiting
for i in {1..1001}; do curl -X GET http://localhost:5001/api/tracks; done

# Test auth rate limiting
for i in {1..11}; do curl -X POST http://localhost:5001/api/auth/login -d '{"email":"test@test.com","password":"wrong"}' -H "Content-Type: application/json"; done
```

### Automated Testing
Implement automated tests to verify:
- Rate limits are properly applied
- Error responses are correct
- Rate limit headers are included
- Limits reset properly after time windows

## Troubleshooting

### Common Issues
1. **Legitimate users being blocked**: Consider increasing limits or implementing user-based limiting
2. **Rate limits not working**: Check middleware order and ensure proper imports
3. **Performance issues**: Consider Redis implementation for high-traffic scenarios

### Debugging
Enable detailed logging to track:
- Rate limit hits
- IP addresses being limited
- Endpoint-specific rate limit effectiveness

## Configuration

### Environment Variables
Consider adding environment variables for rate limit configuration:
```env
RATE_LIMIT_GLOBAL_MAX=1000
RATE_LIMIT_GLOBAL_WINDOW=900000
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_AUTH_WINDOW=900000
```

This allows for easy adjustment without code changes in different environments (development, staging, production). 