// TEMP: Temporary logging endpoint - remove after debugging token refresh issues
import express from 'express';

const router = express.Router();

/**
 * Temporary logging endpoint for debugging
 * Only available in dev or test environments
 * Accepts a message and logs it to CloudWatch
 */
router.post('/log', (req, res) => {
  // Only allow in dev or test environments
  const env = process.env.NODE_ENV || 'development';
  if (env !== 'dev' && env !== 'test' && env !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { message, level = 'info', metadata = {} } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Log to console (which goes to CloudWatch in Lambda)
  const logMessage = `[CLIENT-LOG] [${level.toUpperCase()}] ${message}`;
  const logData = {
    message,
    level,
    metadata,
    timestamp: new Date().toISOString(),
  };

  if (level === 'error') {
    console.error(logMessage, logData);
  } else if (level === 'warn') {
    console.warn(logMessage, logData);
  } else {
    console.log(logMessage, logData);
  }

  res.json({ success: true });
});

export default router;

