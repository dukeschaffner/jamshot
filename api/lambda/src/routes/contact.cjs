const express = require('express');
const router = express.Router();
const { sendContactEmail } = require('../utils/emailService.cjs');
const { contactLimiter } = require('../middleware/rateLimiting.cjs');

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

module.exports = router; 