import express from 'express';
import { adminMiddleware } from '../middleware/adminMiddleware.js';
import { betterAuthMiddleware } from '../middleware/betterAuthMiddleware.js';
import { apiEndpointLimiter } from '../middleware/rateLimiting.js';
import * as outreachService from '../services/outreachService.js';

const router = express.Router();

function handleServiceError(err, res, next) {
  if (err.userFacing) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  return next(err);
}

/**
 * Public: resolve outreach short code — record click and return redirect URL.
 * POST /api/outreach/r/:code/click
 */
router.post('/r/:code/click', apiEndpointLimiter, async (req, res, next) => {
  try {
    const ipAddress =
      req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      null;

    const result = await outreachService.resolveAndRecordClick(req.params.code, {
      ipAddress,
      userAgent: req.headers['user-agent'] || null,
      referrerUrl: req.headers['referer'] || req.headers['referrer'] || null,
      headers: req.headers,
    });

    res.json(result);
  } catch (err) {
    handleServiceError(err, res, next);
  }
});

/**
 * Authenticated: first-touch attribution from stored outreach code.
 * POST /api/outreach/attribution
 */
router.post('/attribution', betterAuthMiddleware, async (req, res, next) => {
  try {
    const { outreachCode } = req.body || {};
    if (!outreachCode) {
      return res.status(400).json({ error: 'Outreach code is required' });
    }

    const result = await outreachService.attributeUserToOutreachCode(
      req.user.id,
      outreachCode
    );
    res.json(result);
  } catch (err) {
    handleServiceError(err, res, next);
  }
});

// --- Admin routes below ---
router.use(adminMiddleware);

router.get('/meta', async (req, res, next) => {
  try {
    res.json(outreachService.getOutreachMeta());
  } catch (err) {
    next(err);
  }
});

router.get('/campaigns', async (req, res, next) => {
  try {
    const campaigns = await outreachService.listCampaigns();
    res.json({ campaigns });
  } catch (err) {
    next(err);
  }
});

router.post('/campaigns', async (req, res, next) => {
  try {
    const { name, slug } = req.body || {};
    const campaign = await outreachService.createCampaign({
      name,
      slug,
      createdBy: req.user.id,
    });
    res.status(201).json({ campaign });
  } catch (err) {
    handleServiceError(err, res, next);
  }
});

router.get('/campaigns/:id', async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignId)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const campaign = await outreachService.getCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const links = await outreachService.listLinks({ campaignId });
    res.json({ campaign, links });
  } catch (err) {
    next(err);
  }
});

router.get('/message-variants', async (req, res, next) => {
  try {
    const messageVariants = await outreachService.listMessageVariants();
    res.json({ messageVariants });
  } catch (err) {
    next(err);
  }
});

router.post('/message-variants', async (req, res, next) => {
  try {
    const { name, slug, body } = req.body || {};
    const messageVariant = await outreachService.createMessageVariant({
      name,
      slug,
      body,
      createdBy: req.user.id,
    });
    res.status(201).json({ messageVariant });
  } catch (err) {
    handleServiceError(err, res, next);
  }
});

router.get('/links', async (req, res, next) => {
  try {
    let campaignId;
    if (req.query.campaignId != null) {
      campaignId = parseInt(req.query.campaignId, 10);
      if (Number.isNaN(campaignId)) {
        return res.status(400).json({ error: 'Invalid campaign ID' });
      }
    }

    const links = await outreachService.listLinks({ campaignId });
    res.json({ links });
  } catch (err) {
    next(err);
  }
});

router.post('/links', async (req, res, next) => {
  try {
    const {
      campaignId,
      messageVariantId,
      platform,
      method,
      artistHandle,
    } = req.body || {};

    const link = await outreachService.createLink({
      campaignId: campaignId != null ? parseInt(campaignId, 10) : null,
      messageVariantId:
        messageVariantId != null ? parseInt(messageVariantId, 10) : null,
      platform,
      method,
      artistHandle,
      createdBy: req.user.id,
    });
    res.status(201).json({ link });
  } catch (err) {
    handleServiceError(err, res, next);
  }
});

export default router;
