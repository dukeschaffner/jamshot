import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const router = express.Router();
const { sendContactEmail } = require('../utils/emailService.js');
const { contactLimiter } = require('../middleware/rateLimiting.js');

// POST /contact
router.post('/', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    await sendContactEmail({ name, email, message });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

export default router; 