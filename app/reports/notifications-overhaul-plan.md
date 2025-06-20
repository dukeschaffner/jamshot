# Notification System Audit & Overhaul Plan

## Executive Summary

The current notification system has several critical issues affecting performance, user experience, and scalability. This report outlines 8 major areas for improvement with a prioritized implementation plan.

## Current System Architecture

### Components
- **Frontend**: `NotificationContext.js` (React context) + `NotificationDropdown.js` (UI component)
- **Backend**: `/api/notifications` routes for CRUD operations
- **Database**: `notifications` table with enum types
- **Integration**: Notifications created across `tracks.js` and `users.js` routes

### Current Flow
1. User actions trigger notification creation in backend routes
2. Frontend polls every 60 seconds for unread count
3. Notifications fetched on dropdown open
4. Complex JOIN query retrieves notification data

## Critical Issues Identified

### 1. **Performance Bottlenecks** 🔴 HIGH PRIORITY
- Complex JOIN query in main notifications endpoint (lines 13-66)
- No pagination (50 item limit but no offset)
- Polling every 60 seconds creates unnecessary load
- Missing database indexes

### 2. **Scalability Problems** 🔴 HIGH PRIORITY  
- No rate limiting for notification spam
- No notification aggregation (mentioned in app-notes.txt)
- No cleanup strategy for old notifications
- Single table approach won't scale

### 3. **User Experience Issues** 🟡 MEDIUM PRIORITY
- No real-time updates (polling only)
- No notification preferences
- No optimistic updates
- Limited error handling and retry logic

### 4. **Data Consistency Issues** 🟡 MEDIUM PRIORITY
- Race conditions possible in follow request handling
- Orphaned notifications not cleaned up
- No foreign key cascade strategies

### 5. **Missing Features** 🟢 LOW PRIORITY
- No email notifications
- No push notifications  
- No notification search/filtering
- No notification analytics

## Step-by-Step Implementation Plan

### Phase 1: Critical Performance Fixes (Week 1)

#### Task 1.1: Add Database Indexes
**File**: `db-updates.txt`
```sql
-- Add these indexes for immediate performance improvement
CREATE INDEX idx_notifications_user_id_created_at ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_id_is_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_type ON notifications(type);
```

#### Task 1.2: Implement Pagination in Backend
**File**: `api/src/routes/notifications.js`
- Modify main GET endpoint to accept `page` and `limit` query params
- Add total count query for pagination metadata
- Return paginated response format

**Changes needed**:
```javascript
// Add to line 10 after userId declaration
const page = parseInt(req.query.page) || 1;
const limit = Math.min(parseInt(req.query.limit) || 20, 50);
const offset = (page - 1) * limit;

// Add LIMIT and OFFSET to main query
// Return: { notifications: [...], pagination: {...} }
```

#### Task 1.3: Optimize Main Query
**File**: `api/src/routes/notifications.js`
- Simplify the complex JOIN by storing actor info directly in notifications table
- Alternative: Break into separate queries for better performance

#### Task 1.4: Add Rate Limiting
**File**: `api/src/routes/notifications.js` (new middleware)
- Create notification rate limiting middleware
- Limit notification creation to 10 per user per hour per type
- Add to all notification creation points

### Phase 2: Frontend Improvements (Week 2)

#### Task 2.1: Add Optimistic Updates
**File**: `ui/src/lib/NotificationContext.js`
- Implement optimistic updates for mark as read, delete actions
- Add rollback logic for failed operations
- Improve error handling with retry logic

#### Task 2.2: Implement Pagination in Frontend
**File**: `ui/src/components/NotificationDropdown.js`
- Add "Load More" button or infinite scroll
- Update context to handle paginated data
- Maintain scroll position during updates

#### Task 2.3: Reduce Polling Frequency
**File**: `ui/src/lib/NotificationContext.js`
- Reduce polling from 60s to 30s
- Add visibility API optimization (only poll when tab is active)
- Add exponential backoff for failed requests

### Phase 3: Spam Prevention & Data Integrity (Week 3)

#### Task 3.1: Create Rate Limiting Infrastructure
**File**: `db-updates.txt`
```sql
CREATE TABLE notification_rate_limits (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  target_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Task 3.2: Implement Notification Batching
**File**: `db-updates.txt`
- Create `notification_batches` table for aggregated notifications
- Example: "User A and 5 others liked your track"

#### Task 3.3: Add Cleanup Jobs
**File**: `api/src/routes/notifications.js`
- Add endpoint for cleaning old read notifications
- Create cron job to run cleanup weekly
- Add cascade deletion for related records

### Phase 4: User Preferences (Week 4)

#### Task 4.1: Create Notification Preferences Schema
**File**: `db-updates.txt`
```sql
CREATE TABLE notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (user_id, type)
);
```

#### Task 4.2: Build Preferences API
**File**: `api/src/routes/notifications.js`
- GET `/preferences` - Get user's notification preferences
- PUT `/preferences` - Update notification preferences
- Integrate with existing notification creation logic

#### Task 4.3: Create Preferences UI
**File**: `ui/src/components/NotificationPreferences.js`
- New component for notification settings
- Toggle switches for each notification type
- Save preferences to backend

### Phase 5: Real-time Updates (Week 5-6)

#### Task 5.1: Implement WebSocket Infrastructure
**File**: `api/src/websocket.js` (new file)
- Set up Socket.IO server
- Create notification broadcasting system
- Handle connection management

#### Task 5.2: Update Frontend for Real-time
**File**: `ui/src/lib/NotificationContext.js`
- Add WebSocket connection
- Replace polling with real-time updates
- Keep polling as fallback

#### Task 5.3: Update Notification Creation
**Files**: `api/src/routes/tracks.js`, `api/src/routes/users.js`
- Emit WebSocket events when creating notifications
- Ensure all notification creation points are updated

### Phase 6: Advanced Features (Week 7-8)

#### Task 6.1: Notification Search & Filtering
**File**: `api/src/routes/notifications.js`
- Add search endpoint with text search
- Add filtering by type, read status, date range
- Update frontend with search UI

#### Task 6.2: Email Notifications
**File**: `api/src/services/emailNotifications.js` (new file)
- Set up email service (SendGrid/AWS SES)
- Create email templates
- Add email sending to notification creation

#### Task 6.3: Analytics & Monitoring
**File**: `api/src/routes/notifications.js`
- Add notification engagement tracking
- Create analytics endpoints
- Add error monitoring and alerting

## Implementation Checklist

### Phase 1: Critical Performance (Week 1)
- [ ] Add database indexes
- [ ] Implement backend pagination
- [ ] Optimize main notification query
- [ ] Add basic rate limiting

### Phase 2: Frontend UX (Week 2)
- [ ] Add optimistic updates to context
- [ ] Implement frontend pagination
- [ ] Reduce polling frequency
- [ ] Add better error handling

### Phase 3: Data Integrity (Week 3)
- [ ] Create rate limiting tables
- [ ] Implement notification batching
- [ ] Add cleanup endpoints and jobs
- [ ] Fix cascade deletion issues

### Phase 4: User Control (Week 4)
- [ ] Create preferences schema
- [ ] Build preferences API
- [ ] Create preferences UI component
- [ ] Integrate preferences with notifications

### Phase 5: Real-time (Week 5-6)
- [ ] Set up WebSocket server
- [ ] Update frontend for real-time
- [ ] Update all notification creation points
- [ ] Test real-time functionality

### Phase 6: Advanced Features (Week 7-8)
- [ ] Add search and filtering
- [ ] Implement email notifications
- [ ] Add analytics and monitoring
- [ ] Performance testing and optimization

## Success Metrics

### Performance Targets
- Notification query response time: < 100ms
- Frontend loading time: < 500ms
- Real-time notification delivery: < 1s

### User Experience Goals
- 90% reduction in notification spam complaints
- 50% increase in notification engagement
- Zero data consistency issues

### Technical Objectives
- Handle 10,000+ notifications per user
- Support 1,000+ concurrent WebSocket connections
- 99.9% notification delivery reliability

## Risk Assessment

### High Risk
- **Database migration complexity**: Test thoroughly in staging
- **WebSocket scaling**: May need Redis for multiple servers
- **Performance regression**: Monitor query performance closely

### Medium Risk
- **User adoption of preferences**: Need good UX design
- **Email deliverability**: Requires proper SMTP setup
- **Real-time connection stability**: Need robust error handling

### Low Risk
- **Frontend optimistic updates**: Easy to rollback
- **Notification batching**: Can be disabled if issues arise
- **Analytics implementation**: Non-critical feature

## Conclusion

This overhaul will transform the notification system from a basic polling-based system to a robust, real-time, user-controlled notification platform. The phased approach ensures we can deliver value incrementally while minimizing risk.

**Estimated Timeline**: 8 weeks
**Estimated Effort**: 120-150 developer hours
**Priority**: High (addresses critical performance and UX issues)

The most critical improvements (Phase 1-2) should be implemented immediately to address current performance issues and improve user experience.


-- Notification System Database Improvements

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_related_track_id ON notifications(related_track_id);
CREATE INDEX IF NOT EXISTS idx_notifications_related_user_id ON notifications(related_user_id);

-- Add composite index for notification aggregation queries
CREATE INDEX IF NOT EXISTS idx_notifications_aggregation ON notifications(user_id, type, related_track_id, created_at);

-- Add constraints for data integrity
ALTER TABLE notifications 
ADD CONSTRAINT chk_notifications_related_data 
CHECK (
  (type = 'follow_request' AND related_user_id IS NOT NULL AND related_track_id IS NULL) OR
  (type IN ('like', 'comment', 'new_version', 'repost') AND related_track_id IS NOT NULL) OR
  (type = 'featured' AND related_track_id IS NOT NULL)
);

-- Create notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, type)
);

-- Create default notification preferences for existing users
INSERT INTO notification_preferences (user_id, type, enabled, email_enabled, push_enabled)
SELECT u.id, nt.type, TRUE, FALSE, TRUE
FROM users u
CROSS JOIN (
  SELECT unnest(enum_range(NULL::notification_type)) AS type
) nt
ON CONFLICT (user_id, type) DO NOTHING;

-- Add function to automatically create notification preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id, type, enabled, email_enabled, push_enabled)
  SELECT NEW.id, unnest(enum_range(NULL::notification_type)), TRUE, FALSE, TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new users
DROP TRIGGER IF EXISTS trigger_create_notification_preferences ON users;
CREATE TRIGGER trigger_create_notification_preferences
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();

-- Add notification batching table for aggregated notifications
CREATE TABLE IF NOT EXISTS notification_batches (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  related_track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  actor_count INT NOT NULL DEFAULT 1,
  latest_actor_id INT REFERENCES users(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for notification batches
CREATE INDEX IF NOT EXISTS idx_notification_batches_user_id ON notification_batches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_batches_type ON notification_batches(type);

-- Add rate limiting table for notification spam prevention
CREATE TABLE IF NOT EXISTS notification_rate_limits (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  target_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, target_user_id, notification_type, window_start)
);

-- Add index for rate limiting
CREATE INDEX IF NOT EXISTS idx_notification_rate_limits_window ON notification_rate_limits(user_id, target_user_id, notification_type, window_start);

-- Add function to clean up old rate limit records
CREATE OR REPLACE FUNCTION cleanup_notification_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM notification_rate_limits 
  WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Add function to check rate limits before creating notifications
CREATE OR REPLACE FUNCTION check_notification_rate_limit(
  p_user_id INT,
  p_target_user_id INT,
  p_notification_type notification_type,
  p_max_per_hour INT DEFAULT 10
)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INT;
  window_start TIMESTAMP;
BEGIN
  -- Calculate the current hour window
  window_start := date_trunc('hour', NOW());
  
  -- Get current count for this hour
  SELECT COALESCE(SUM(count), 0) INTO current_count
  FROM notification_rate_limits
  WHERE user_id = p_user_id
    AND target_user_id = p_target_user_id
    AND notification_type = p_notification_type
    AND window_start >= date_trunc('hour', NOW());
  
  -- Check if we're under the limit
  IF current_count >= p_max_per_hour THEN
    RETURN FALSE;
  END IF;
  
  -- Update or insert rate limit record
  INSERT INTO notification_rate_limits (user_id, target_user_id, notification_type, count, window_start)
  VALUES (p_user_id, p_target_user_id, p_notification_type, 1, window_start)
  ON CONFLICT (user_id, target_user_id, notification_type, window_start)
  DO UPDATE SET count = notification_rate_limits.count + 1;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER trigger_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_notification_batches_updated_at
  BEFORE UPDATE ON notification_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 