const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe.cjs');
const db = require('../config/db.cjs');
const {authMiddleware} = require('../middleware/auth.cjs');
const { contentCreationLimiter } = require('../middleware/rateLimiting.cjs');
const { SUBSCRIPTION_TIERS, SUBSCRIPTION_PLANS, isValidTier } = require('../utils/subscriptionUtils.cjs');

// Create a checkout session for donations
router.post('/create-checkout-session', contentCreationLimiter, authMiddleware, async (req, res) => {
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

// Create a subscription checkout session
router.post('/create-subscription-session', contentCreationLimiter, authMiddleware, async (req, res) => {
  try {
    const { tier } = req.body;
    
    if (!tier || !isValidTier(tier) || tier === SUBSCRIPTION_TIERS.FREE) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }

    // Use the helper function
    return await createNewSubscriptionSession(tier, req.user, res);
  } catch (error) {
    console.error('Error creating subscription session:', error);
    res.status(500).json({ error: 'Failed to create subscription session' });
  }
});

// Cancel subscription
router.post('/cancel-subscription', authMiddleware, async (req, res) => {
  try {
    const userResult = await db.query(
      'SELECT subscription_tier, subscription_expires_at, stripe_subscription_id FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Cancel the subscription at period end
    await stripe.subscriptions.update(user.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    res.json({ message: 'Subscription will be canceled at the end of the current period' });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Modify existing subscription (upgrade/downgrade/switch tiers)
router.post('/modify-subscription', contentCreationLimiter, authMiddleware, async (req, res) => {
  try {
    const { tier: newTier } = req.body;
    const userResult = await db.query(
      'SELECT subscription_tier, subscription_expires_at, stripe_subscription_id FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    if (!newTier || !isValidTier(newTier)) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }

    // If user doesn't have an existing subscription, create a new one
    if (!user.stripe_subscription_id) {
      if (newTier === SUBSCRIPTION_TIERS.FREE) {
        return res.status(400).json({ error: 'User is already on free tier' });
      }
      
      // Redirect to create new subscription
      return await createNewSubscriptionSession(newTier, user, res);
    }

    // Handle downgrade to free tier
    if (newTier === SUBSCRIPTION_TIERS.FREE) {
      await stripe.subscriptions.update(user.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      
      return res.json({ 
        message: 'Subscription will be canceled and you will be moved to the free tier at the end of your current billing period',
        type: 'downgrade_to_free'
      });
    }

    // Handle reactivation of canceled subscription
    const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    if (subscription.cancel_at_period_end) {
      // If trying to reactivate with same tier, just remove cancellation
      const currentPriceId = subscription.items.data[0]?.price?.id;
      const newPlan = SUBSCRIPTION_PLANS[newTier];
      
      if (currentPriceId === newPlan.stripe_price_id) {
        await stripe.subscriptions.update(user.stripe_subscription_id, {
          cancel_at_period_end: false,
        });
        
        return res.json({ 
          message: `Successfully reactivated your ${newPlan.name} subscription`,
          type: 'reactivation'
        });
      }
    }

    // Handle tier change between paid plans
    const newPlan = SUBSCRIPTION_PLANS[newTier];
    if (!newPlan.stripe_price_id) {
      return res.status(400).json({ error: 'Subscription plan not configured' });
    }

    // Get current subscription details
    // Update subscription with new price - Stripe handles proration automatically
    const updatedSubscription = await stripe.subscriptions.update(user.stripe_subscription_id, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPlan.stripe_price_id,
      }],
      cancel_at_period_end: false, // Ensure subscription is not set to cancel
      proration_behavior: 'always_invoice', // Handle proration for immediate changes
    });

    // Update user record immediately (webhook will also update, but this ensures consistency)
    await db.query(
      `UPDATE users SET 
       subscription_tier = $1, 
       subscription_expires_at = $2
       WHERE id = $3`,
      [
        newTier,
        new Date(updatedSubscription.current_period_end * 1000),
        user.id
      ]
    );

    res.json({ 
      message: `Successfully switched to ${newPlan.name} plan`,
      type: 'tier_change',
      newTier: newTier
    });

  } catch (error) {
    console.error('Error modifying subscription:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to modify subscription'
    });
  }
});

// Helper function to create new subscription session (extracted from existing endpoint)
async function createNewSubscriptionSession(tier, user, res) {
  const plan = SUBSCRIPTION_PLANS[tier];
  
  if (!plan.stripe_price_id) {
    return res.status(400).json({ error: 'Subscription plan not configured' });
  }

  // Check if user already has a Stripe customer ID
  let customerId = user.stripe_customer_id;
  
  if (!customerId) {
    // Create a new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userId: user.id,
      },
    });
    customerId = customer.id;
    
    // Update user with Stripe customer ID
    await db.query(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
      [customerId, user.id]
    );
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price: plan.stripe_price_id,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    customer: customerId,
    success_url: `${process.env.FRONTEND_URL}/subscribe?success=true&tier=${tier}`,
    cancel_url: `${process.env.FRONTEND_URL}/subscribe?canceled=true`,
    metadata: {
      userId: user.id,
      tier: tier,
    },
  });

  return res.json({ 
    id: session.id, 
    url: session.url, 
    type: 'checkout_session'
  });
}

// Get current subscription status
router.get('/subscription-status', authMiddleware, async (req, res) => {
  try {
    // Fetch user from database to ensure we have the latest data
    const userResult = await db.query(
      'SELECT subscription_tier, subscription_expires_at, stripe_subscription_id FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    let subscriptionStatus = {
      tier: user.subscription_tier || SUBSCRIPTION_TIERS.FREE,
      expires_at: user.subscription_expires_at,
      is_active: false,
      cancel_at_period_end: false
    };

    if (user.stripe_subscription_id && subscriptionStatus.tier !== SUBSCRIPTION_TIERS.FREE) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
        subscriptionStatus.is_active = subscription.status === 'active';
        subscriptionStatus.cancel_at_period_end = subscription.cancel_at_period_end;
        subscriptionStatus.current_period_end = new Date(subscription.current_period_end * 1000);
      } catch (error) {
        console.error('Error retrieving subscription from Stripe:', error);
      }
    }

    res.json(subscriptionStatus);
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
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

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object); //handle one-time payment (sets supporter = true)
        break;
      
      // case 'customer.subscription.created':
      //   await handleSubscriptionUpdated(event.data.object); //handle new subscription (sets subscription_tier and subscription_expires_at)
      //   break;
      case 'customer.subscription.updated':
        if(event.data.object.status == "active"){
          await handleSubscriptionUpdated(event.data.object); //handle subscription update (sets subscription_tier and subscription_expires_at)
        }
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object); // handle subscription cancellation (sets subscription_tier to free)
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object); // logs event
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object); // logs event
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).send('Webhook processing failed');
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send();
});

// Webhook helper functions
async function handleCheckoutCompleted(session) {
  if (session.mode === 'payment') {
    const userId = session.metadata.userId;
    const paymentType = session.metadata.type;
    
    if (!userId) {
      console.error('No user ID found in session metadata');
      return;
    }

    // Record the payment
    await db.query(
      `INSERT INTO payments (user_id, amount, currency, stripe_payment_id, stripe_checkout_id, status) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        session.amount_total / 100,
        session.currency,
        session.payment_intent,
        session.id,
        'completed'
      ]
    );

    // Handle different payment types
    if (paymentType === 'camp_creation') {
      // Create camp after successful payment
      await handleCampCreation(session);
    } else if (paymentType === 'competition_creation') {
      // Create competition after successful payment
      const {
        trackId,
        startdate,
        enddate,
        prizeAmount,
        winnerSelectionMethod,
        pinned,
        voucherCode
      } = session.metadata;
      
      if (trackId && startdate && enddate && prizeAmount && winnerSelectionMethod) {
        try {
          // Ensure dates are parsed as UTC (frontend sends UTC ISO strings)
          const startDateUTC = new Date(startdate + (startdate.includes('Z') ? '' : 'Z'));
          const endDateUTC = new Date(enddate + (enddate.includes('Z') ? '' : 'Z'));

          const competitionResult = await db.query(
            `INSERT INTO competitions (
              track_id, startdate, enddate, prize_amount, host_id,
              pinned, winner_selection_method, voucher_code
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
              trackId,
              startDateUTC,
              endDateUTC,
              parseInt(prizeAmount),
              userId,
              pinned === 'true',
              winnerSelectionMethod,
              voucherCode || null
            ]
          );
          
          const competition = competitionResult.rows[0];

          // Update the host track with competition_id (is_competition_entry remains false to indicate host track)
          await db.query(
            'UPDATE tracks SET competition_id = $1 WHERE id = $2',
            [competition.id, trackId]
          );

          // Schedule the competition end event
          try {
            const { scheduleCompetitionEnd } = require('../utils/eventBridgeScheduler');
            await scheduleCompetitionEnd(competition.id, endDateUTC, winnerSelectionMethod);
            console.log(`Competition end scheduled for ID: ${competition.id} after payment`);
          } catch (scheduleError) {
            console.error('Error scheduling competition end after payment:', scheduleError);
          }

          console.log(`Competition created successfully after payment: ${competition.id}`);
        } catch (error) {
          console.error('Error creating competition after payment:', error);
        }
      } else {
        console.error('Missing competition data in session metadata');
      }
    } else {
      // Default: donation/supporter payment
      await db.query(
        `UPDATE users SET is_supporter = TRUE WHERE id = $1`,
        [userId]
      );
      console.log(`Donation payment successful for user ${userId}`);
    }
  } else if (session.mode === 'subscription') {
    // Subscription checkout completed
    const userId = session.metadata.userId;
    const paymentType = session.metadata.type;
    
    if (!userId) {
      console.error('No user ID found in session metadata');
      return;
    }

    // Handle different subscription types
    if (paymentType === 'team_creation') {
      // Create team after successful subscription checkout
      await handleTeamCreation(session);
    } else {
      // User subscription (handled by customer.subscription.updated)
      console.log(`Subscription checkout completed for session ${session.id}`);
    }
  }
}

async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;
  
  // Check if this is a team subscription
  const teamResult = await db.query(
    'SELECT id FROM teams WHERE stripe_subscription_id = $1 OR stripe_customer_id = $2',
    [subscription.id, customerId]
  );

  if (teamResult.rows.length > 0) {
    // Update team subscription status
    const status = subscription.status === 'active' ? 'active' : 
                   subscription.status === 'trialing' ? 'trialing' :
                   subscription.status === 'past_due' ? 'past_due' :
                   subscription.status === 'unpaid' ? 'unpaid' : 'canceled';

    await db.query(
      `UPDATE teams SET 
       subscription_status = $1,
       subscription_expires_at = $2
       WHERE stripe_subscription_id = $3 OR stripe_customer_id = $4`,
      [
        status,
        new Date(subscription.current_period_end * 1000),
        subscription.id,
        customerId
      ]
    );

    console.log(`Team subscription updated: ${subscription.id}, status: ${status}`);
    return;
  }

  // Find user by Stripe customer ID
  const userResult = await db.query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (userResult.rows.length === 0) {
    console.error(`User not found for customer ID: ${customerId}`);
    return;
  }

  const userId = userResult.rows[0].id;
  
  // Determine tier from price ID
  let tier = SUBSCRIPTION_TIERS.FREE;
  const priceId = subscription.items.data[0]?.price?.id;
  
  for (const [tierKey, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
    if (plan.stripe_price_id === priceId) {
      tier = tierKey;
      break;
    }
  }

  // Update user subscription
  await db.query(
    `UPDATE users SET 
     subscription_tier = $1, 
     subscription_expires_at = $2,
     stripe_subscription_id = $3
     WHERE id = $4`,
    [
      tier,
      new Date(subscription.current_period_end * 1000),
      subscription.id,
      userId
    ]
  );

  console.log(`Subscription updated for user ${userId}: ${tier}`);
}

async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;
  
  // Check if this is a team subscription
  const teamResult = await db.query(
    'SELECT id FROM teams WHERE stripe_subscription_id = $1 OR stripe_customer_id = $2',
    [subscription.id, customerId]
  );

  if (teamResult.rows.length > 0) {
    // Update team subscription status to canceled
    await db.query(
      `UPDATE teams SET 
       subscription_status = 'canceled',
       subscription_expires_at = $1
       WHERE stripe_subscription_id = $2 OR stripe_customer_id = $3`,
      [
        new Date(subscription.canceled_at * 1000),
        subscription.id,
        customerId
      ]
    );

    console.log(`Team subscription canceled: ${subscription.id}`);
    return;
  }

  // Find user by Stripe customer ID
  const userResult = await db.query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (userResult.rows.length === 0) {
    console.error(`User not found for customer ID: ${customerId}`);
    return;
  }

  const userId = userResult.rows[0].id;

  // Reset user to free tier
  await db.query(
    `UPDATE users SET 
     subscription_tier = $1, 
     subscription_expires_at = NULL,
     stripe_subscription_id = NULL
     WHERE id = $2`,
    [SUBSCRIPTION_TIERS.FREE, userId]
  );

  console.log(`Subscription canceled for user ${userId}`);
}

async function handleInvoicePaymentSucceeded(invoice) {
  // Handle successful recurring payment
  console.log(`Invoice payment succeeded: ${invoice.id}`);
}

async function handleInvoicePaymentFailed(invoice) {
  // Handle failed payment - could send notification to user
  console.log(`Invoice payment failed: ${invoice.id}`);
}

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

// Webhook helper functions
async function handleCampCreation(session) {
  const {
    userId,
    campName,
    startDate,
    endDate,
    productVersion
  } = session.metadata;

  try {
    // Generate unique camp code
    const crypto = require('crypto');
    const campCode = crypto.randomBytes(16).toString('hex');

    // Create camp
    const campResult = await db.query(
      `INSERT INTO camps (name, start_date, end_date, created_by, product_version, camp_code, stripe_payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [campName, startDate, endDate, userId, productVersion, campCode, session.id]
    );

    // Add creator as owner to user_camps
    await db.query(
      `INSERT INTO user_camps (user_id, camp_id, role)
       VALUES ($1, $2, 'owner')`,
      [userId, campResult.rows[0].id]
    );

    console.log(`Camp "${campName}" created successfully for user ${userId} after payment ${session.id}`);
  } catch (error) {
    console.error('Error creating camp in webhook:', error);
    throw error; // Re-throw to ensure webhook processing fails appropriately
  }
}

async function handleTeamCreation(session) {
  const {
    userId,
    teamName,
    productVersion
  } = session.metadata;

  try {
    // Get subscription ID from session (for subscription mode)
    const subscriptionId = session.subscription;
    const customerId = session.customer;

    if (!subscriptionId) {
      console.error('No subscription ID found in session');
      return;
    }

    // Generate unique team code
    const crypto = require('crypto');
    const teamCode = crypto.randomBytes(16).toString('hex');

    // Create team
    const teamResult = await db.query(
      `INSERT INTO teams (name, created_by, product_version, stripe_subscription_id, stripe_customer_id, subscription_status, subscription_expires_at, team_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        teamName,
        userId,
        productVersion,
        subscriptionId,
        customerId,
        'active',
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now, will be updated by subscription.updated webhook
        teamCode
      ]
    );

    // Add creator as owner to team_members
    await db.query(
      `INSERT INTO team_members (user_id, team_id, role)
       VALUES ($1, $2, 'owner')`,
      [userId, teamResult.rows[0].id]
    );

    console.log(`Team "${teamName}" created successfully for user ${userId} after subscription ${subscriptionId}`);
  } catch (error) {
    console.error('Error creating team in webhook:', error);
    throw error; // Re-throw to ensure webhook processing fails appropriately
  }
}

module.exports = router; 