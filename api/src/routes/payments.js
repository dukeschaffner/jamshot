const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const db = require('../config/db');
const {authMiddleware} = require('../middleware/auth');

// Create a checkout session
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Convert amount to cents for Stripe
    const amountInCents = Math.round(amount * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Sterio Supporter Donation',
              description: 'Thank you for supporting Sterio!',
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/about?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/about?payment=canceled`,
      metadata: {
        userId: req.user.id,
      },
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook handler
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    try {
      // Get user ID from metadata
      const userId = session.metadata.userId;
      
      if (!userId) {
        console.error('No user ID found in session metadata');
        return res.status(400).json({ error: 'No user ID found' });
      }

      // Record the payment
      await db.query(
        `INSERT INTO payments (user_id, amount, currency, stripe_payment_id, stripe_checkout_id, status) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          session.amount_total / 100, // Convert from cents back to dollars
          session.currency,
          session.payment_intent,
          session.id,
          'completed'
        ]
      );

      // Update user to be a supporter
      await db.query(
        `UPDATE users SET is_supporter = TRUE WHERE id = $1`,
        [userId]
      );

      console.log(`Payment successful for user ${userId}`);
    } catch (error) {
      console.error('Error processing payment webhook:', error);
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send();
});

// Get payment history for the authenticated user
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

module.exports = router; 