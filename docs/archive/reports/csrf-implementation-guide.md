# CSRF Protection Implementation Guide

## Overview

This document outlines the CSRF (Cross-Site Request Forgery) protection implementation for the JamShot application. The implementation uses a **double-submit cookie pattern** that works seamlessly with the existing JWT authentication system.

## How It Works

### Double-Submit Cookie Pattern

1. **Token Generation**: When a user authenticates, the server generates a cryptographically secure CSRF token
2. **Token Storage**: The token is stored in two places:
   - As a cookie (`csrfToken`) that the client can read
   - As a response header (`X-CSRF-Token`)
3. **Token Validation**: For state-changing requests (POST, PUT, DELETE, PATCH):
   - Client sends the token in the `X-CSRF-Token` header
   - Server compares the header token with the cookie token
   - Request is allowed only if both tokens exist and match

### Security Benefits

- **CSRF Protection**: Malicious sites cannot read cookies from your domain due to Same-Origin Policy
- **No Storage Required**: Server doesn't need to store CSRF tokens (stateless)
- **JWT Compatible**: Works alongside existing JWT authentication
- **Automatic Handling**: Client-side library handles token management automatically

## Implementation Details

### Backend Changes

#### 1. New CSRF Middleware (`api/src/middleware/csrf.js`)

```javascript
// Key functions:
- generateCSRFToken(): Creates secure 64-character hex tokens
- setCSRFToken(): Sets CSRF token in cookie and response header
- validateCSRFToken(): Validates token for state-changing requests
- csrfProtection(): Combined middleware for token management
```

#### 2. Express App Configuration (`api/src/index.js`)

```javascript
// Added:
- cookie-parser middleware
- CSRF protection middleware
- Updated CORS to allow X-CSRF-Token header
- Enabled credentials for cookie sharing
```

#### 3. Auth Routes Update (`api/src/routes/auth.js`)

```javascript
// Modified:
- Login endpoint: Sets CSRF token after successful authentication
- Refresh token endpoint: Regenerates CSRF token with new access token
```

### Frontend Changes

#### 1. API Client Updates (`ui/src/lib/api.js`)

```javascript
// Added:
- withCredentials: true for cookie support
- Automatic CSRF token inclusion in state-changing requests
- CSRF token storage from response headers
- CSRF error handling with automatic retry
```

## Security Configuration

### Cookie Settings

```javascript
{
  httpOnly: false,        // Client needs to read for header inclusion
  secure: production,     // HTTPS only in production
  sameSite: 'strict',    // Prevents cross-site cookie sending
  maxAge: 3600000        // 1 hour expiration
}
```

### CORS Configuration

```javascript
{
  credentials: true,                              // Allow cookies
  allowedHeaders: [..., 'X-CSRF-Token'],         // Allow CSRF header
  origin: [trusted_domains]                      // Restrict origins
}
```

## Testing the Implementation

### 1. Verify Token Generation

```bash
# Login and check for CSRF token in cookies
curl -c cookies.txt -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Check cookies file for csrfToken
cat cookies.txt | grep csrfToken
```

### 2. Test Protected Endpoints

```bash
# This should FAIL (no CSRF token)
curl -b cookies.txt -X POST http://localhost:5001/api/tracks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Track"}'

# This should SUCCEED (with CSRF token)
curl -b cookies.txt -X POST http://localhost:5001/api/tracks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Track"}'
```

### 3. Browser Testing

1. Open browser dev tools → Network tab
2. Login to the application
3. Check Response Headers for `X-CSRF-Token`
4. Check Application → Cookies for `csrfToken`
5. Make a state-changing request (upload track, update profile)
6. Verify `X-CSRF-Token` header is sent in request

### 4. Security Testing

```javascript
// Simulate CSRF attack (should fail)
// From malicious site, try to make request:
fetch('https://yourapp.com/api/tracks', {
  method: 'POST',
  credentials: 'include', // This will send cookies
  headers: {
    'Content-Type': 'application/json',
    // Cannot set X-CSRF-Token from different origin
  },
  body: JSON.stringify({title: 'Malicious Track'})
});
// This will fail because X-CSRF-Token header cannot be set
```

## Error Handling

### CSRF Error Codes

- `CSRF_TOKEN_MISSING`: Token not provided in header or cookie
- `CSRF_TOKEN_MISMATCH`: Header and cookie tokens don't match

### Client-Side Handling

The API client automatically handles CSRF errors by:
1. Clearing invalid CSRF tokens
2. Retrying the request once
3. Allowing normal error handling if retry fails

## Monitoring and Logging

Consider adding logging for:
- CSRF token validation failures
- Suspicious patterns of CSRF errors
- Token generation/refresh events

## Production Considerations

1. **HTTPS Required**: CSRF tokens should only be sent over HTTPS in production
2. **Token Rotation**: Tokens are automatically rotated on each authenticated request
3. **Expiration**: Tokens expire after 1 hour (same as access tokens)
4. **Rate Limiting**: Consider rate limiting CSRF failures to prevent abuse

## Backward Compatibility

- GET requests are not affected (no CSRF validation)
- Unauthenticated requests are not affected
- Existing API clients will receive 403 errors until updated to include CSRF tokens

## Future Enhancements

1. **Encrypted Tokens**: Consider encrypting CSRF tokens for additional security
2. **Token Binding**: Bind CSRF tokens to specific user sessions
3. **Custom Token Names**: Use custom cookie/header names to obscure implementation
4. **Logging Integration**: Add structured logging for security events

## Troubleshooting

### Common Issues

1. **"CSRF token missing" errors**
   - Ensure `withCredentials: true` in API client
   - Check CORS configuration allows credentials
   - Verify cookie is being set and sent

2. **"CSRF token mismatch" errors**
   - Check for token corruption during transmission
   - Verify cookie and header values match exactly
   - Check for concurrent requests overwriting tokens

3. **Tokens not being set**
   - Ensure user is authenticated before token generation
   - Check middleware order (auth before CSRF)
   - Verify cookie settings for your environment

### Debug Mode

Add this to your middleware for debugging:

```javascript
console.log('CSRF Debug:', {
  method: req.method,
  headerToken: req.get('X-CSRF-Token'),
  cookieToken: req.cookies.csrfToken,
  user: req.user?.id
});
```

## Conclusion

This CSRF protection implementation provides robust security against cross-site request forgery attacks while maintaining compatibility with the existing JWT authentication system. The double-submit cookie pattern ensures that only legitimate requests from your application can perform state-changing operations. 