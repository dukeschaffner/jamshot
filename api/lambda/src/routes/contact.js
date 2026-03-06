import express from 'express';

const router = express.Router();
import { sendContactEmail } from '../utils/emailService.js';
import { contactLimiter } from '../middleware/rateLimiting.js';

// POST /contact
router.post('/', contactLimiter, async (req, res, next) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    await sendContactEmail({ name, email, message });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router; 