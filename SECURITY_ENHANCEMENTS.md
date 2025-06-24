# File Upload Security Enhancements

## Overview
This document outlines the comprehensive security enhancements implemented for file uploads in the Jamshot application, focusing on both audio files and images.

## Security Measures Implemented

### 1. File Type Validation
- **MIME Type Checking**: Validates file MIME types against allowed lists
- **Magic Number Verification**: Checks file headers to prevent MIME type spoofing
- **Extension Validation**: Ensures file extensions match expected formats

#### Supported Audio Formats
- MP3 (`audio/mpeg`)
- WAV (`audio/wav`, `audio/x-wav`, `audio/wave`)
- AAC (`audio/aac`, `audio/mp4`, `audio/x-m4a`)
- FLAC (`audio/flac`)
- OGG (`audio/ogg`)
- WebM (`audio/webm`)

#### Supported Image Formats
- JPEG (`image/jpeg`)
- PNG (`image/png`)
- WebP (`image/webp`)
- GIF (`image/gif`)

### 2. File Size Limits
- **Audio Files**: 50MB maximum
- **Image Files**: 5MB maximum
- **Multer Configuration**: Enforced at upload middleware level

### 3. Virus Scanning
- **Integration**: ClamAV antivirus scanning via the `clamscan` package
- **Process**: All uploaded files are scanned before processing
- **Fallback**: Graceful degradation if virus scanner is unavailable
- **Logging**: Security events are logged for monitoring
- **Dual Mode**: Supports both `clamdscan` (daemon) and `clamscan` (binary) modes

### 4. Filename Sanitization
- **Dangerous Characters**: Removes potentially harmful characters
- **Path Traversal**: Prevents directory traversal attacks (`../`)
- **Length Limits**: Enforces maximum filename length (255 characters)
- **Secure Generation**: Creates timestamped, secure filenames for storage

### 5. Content Validation
- **Audio Metadata**: Validates duration, sample rate, and format
- **Image Processing**: Uses Sharp library for secure image processing
- **Buffer Validation**: Ensures file buffers are valid before processing

### 6. Rate Limiting
- **Upload Limits**: Existing rate limiting middleware applied
- **Daily Limits**: 3 uploads per day per user for tracks
- **Total Limits**: 50 tracks maximum per user

### 7. Input Sanitization
- **Title Validation**: Removes HTML tags and dangerous characters
- **Metadata Sanitization**: Cleans all user-provided metadata
- **JSON Validation**: Secure parsing of JSON inputs

## Implementation Details

### Backend Middleware (`api/src/middleware/fileValidation.js`)

#### Audio File Validation
```javascript
validateAudioFile(req, res, next)
```
- Validates file type, size, and metadata
- Performs virus scanning
- Adds validation results to request object

#### Image File Validation
```javascript
validateImageFile(req, res, next)
```
- Validates image format and dimensions
- Performs security checks
- Sanitizes filenames

### Enhanced Upload Routes

#### Track Upload (`api/src/routes/tracks.js`)
- Integrated `validateAudioFile` middleware
- Enhanced error handling for security failures
- Secure filename generation
- Metadata validation improvements

#### Profile Image Upload (`api/src/routes/users.js`)
- Integrated `validateImageFile` middleware
- Position data validation
- Secure S3 upload with metadata
- Enhanced error messages

### Frontend Enhancements (`ui/src/components/DAW/UploadForm.js`)

#### Client-Side Validation
- Pre-upload file type checking
- File size validation
- Filename sanitization
- User feedback for validation errors

#### Security Indicators
- Visual security assurance notices
- Real-time validation warnings
- Enhanced error messages for security failures

## Security Dependencies Added

### Package.json Updates
```json
{
  "file-type": "^19.0.0",        // File type detection
  "clamscan": "^2.4.0",          // ClamAV virus scanning
  "sanitize-filename": "^1.6.3"  // Filename sanitization
}
```

## Configuration Requirements

### Environment Variables
```bash
# ClamAV Configuration (optional - for daemon mode)
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# S3 Configuration (existing)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
S3_BUCKET=your_bucket_name
```

### ClamAV Setup
For production environments, install and configure ClamAV:

```bash
# Ubuntu/Debian
sudo apt-get install clamav clamav-daemon
sudo freshclam  # Update virus definitions
sudo systemctl start clamav-daemon

# macOS
brew install clamav
sudo freshclam
sudo brew services start clamav

# CentOS/RHEL
sudo yum install clamav clamav-update
sudo freshclam
sudo systemctl start clamd
```

### ClamAV Configuration Options
The `clamscan` package supports multiple scanning modes:

1. **Daemon Mode (clamdscan)**: Fast, recommended for production
   - Requires `clamd` daemon running
   - Lower resource usage per scan
   - Faster scanning

2. **Binary Mode (clamscan)**: Fallback option
   - Uses clamscan binary directly
   - Higher resource usage per scan
   - Works without daemon

3. **Local Fallback**: Automatically falls back to binary mode if daemon is unavailable

## Security Best Practices Implemented

### 1. Defense in Depth
- Multiple validation layers (client + server)
- File type validation at multiple levels
- Content scanning and metadata validation

### 2. Fail-Safe Defaults
- Reject unknown file types
- Default to most restrictive settings
- Graceful degradation for optional security features

### 3. Input Validation
- Whitelist approach for file types
- Strict validation of all user inputs
- Sanitization of filenames and metadata

### 4. Error Handling
- Security-conscious error messages
- Detailed logging for security events
- No information leakage in error responses

### 5. Resource Protection
- File size limits prevent DoS attacks
- Rate limiting prevents abuse
- Secure file storage with proper permissions

## Monitoring and Logging

### Security Events Logged
- File validation failures
- Virus detection events
- Suspicious upload attempts
- Rate limit violations
- ClamAV scanner availability

### Recommended Monitoring
- Set up alerts for repeated validation failures
- Monitor virus scanner health and performance
- Track upload patterns for anomalies
- Review security logs regularly
- Monitor ClamAV daemon status

## Testing Recommendations

### Security Testing
1. **Malicious File Testing**: Test with known malicious files (EICAR test files)
2. **File Type Spoofing**: Test with files having incorrect extensions
3. **Oversized Files**: Test file size limits
4. **Rate Limit Testing**: Verify rate limiting works correctly
5. **Input Validation**: Test with malicious filenames and metadata
6. **ClamAV Testing**: Test with and without ClamAV daemon running

### Performance Testing
1. **Large File Uploads**: Test with maximum allowed file sizes
2. **Concurrent Uploads**: Test multiple simultaneous uploads
3. **Virus Scanner Performance**: Monitor scanning times and resource usage
4. **S3 Upload Performance**: Monitor upload speeds and reliability
5. **Daemon vs Binary**: Compare performance between scanning modes

## Future Enhancements

### Potential Improvements
1. **Advanced Threat Detection**: Integration with cloud-based security services
2. **Content Analysis**: Audio content analysis for copyright detection
3. **User Reputation**: Adjust security levels based on user trust scores
4. **Quarantine System**: Temporary storage for suspicious files
5. **Security Analytics**: Advanced pattern recognition for threats
6. **Distributed Scanning**: Load balancing across multiple ClamAV instances

### Scalability Considerations
1. **Distributed Scanning**: Multiple virus scanner instances
2. **Caching**: Cache validation results for duplicate files
3. **Async Processing**: Background processing for large files
4. **CDN Integration**: Secure content delivery networks
5. **Container Deployment**: Docker containers for ClamAV scalability

## Troubleshooting

### Common Issues
1. **ClamAV Not Found**: Ensure ClamAV is installed and in system PATH
2. **Daemon Connection Failed**: Check if `clamd` daemon is running
3. **Virus Database Outdated**: Run `freshclam` to update definitions
4. **Permission Issues**: Ensure proper file permissions for temp directories
5. **Memory Issues**: Monitor memory usage during large file scans

### Debug Mode
Enable debug logging by setting environment variable:
```bash
NODE_ENV=development
```

## Conclusion

These security enhancements provide comprehensive protection against common file upload vulnerabilities while maintaining a smooth user experience. The implementation follows security best practices and provides multiple layers of defense against malicious content.

The use of the `clamscan` package provides flexible virus scanning capabilities with automatic fallback mechanisms, ensuring robust security even in environments where the ClamAV daemon is not available.

Regular security audits, virus definition updates, and monitoring of the ClamAV scanner health are recommended to maintain the effectiveness of these security measures. 