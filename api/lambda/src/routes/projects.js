import express from 'express';
import pool from '../config/db.js';
import { betterAuthMiddleware as authMiddleware } from '../middleware/betterAuthMiddleware.js';
import { contentCreationLimiter } from '../middleware/rateLimiting.js';
import { requireProjectsFeature } from '../middleware/projectsFeatureMiddleware.js';
import { validateTeamAccess } from '../utils/teamUtils.js';
import { validateCampAccess } from '../utils/campUtils.js';
import { checkCanCreateProject } from '../utils/projectAccess.js';
import { formatProjectSummary } from '../utils/projectUtils.js';

const router = express.Router();

router.use(requireProjectsFeature);
router.use(authMiddleware);

function parseOptionalInt(value) {
  if (value == null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function validateProjectName(name) {
  if (name == null || typeof name !== 'string') {
    return { valid: false, error: 'Project name is required' };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Project name is required' };
  }
  if (trimmed.length > 200) {
    return { valid: false, error: 'Project name must be 200 characters or less' };
  }
  return { valid: true, name: trimmed };
}

router.post('/', contentCreationLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, team_id: teamIdRaw, camp_id: campIdRaw } = req.body;

    const nameValidation = validateProjectName(name);
    if (!nameValidation.valid) {
      return res.status(400).json({ error: nameValidation.error });
    }

    const teamId = parseOptionalInt(teamIdRaw);
    const campId = parseOptionalInt(campIdRaw);

    if (Number.isNaN(teamId) || Number.isNaN(campId)) {
      return res.status(400).json({ error: 'Invalid team_id or camp_id' });
    }

    if (teamId != null && campId != null) {
      return res.status(400).json({ error: 'Cannot set both team_id and camp_id' });
    }

    const userResult = await pool.query(
      'SELECT id, subscription_tier, subscription_expires_at FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    let productVersion = null;

    if (teamId != null) {
      const teamAccess = await validateTeamAccess(teamId, userId);
      if (!teamAccess.valid) {
        return res.status(403).json({ error: teamAccess.error });
      }
      productVersion = teamAccess.team.product_version;
    }

    if (campId != null) {
      const campAccess = await validateCampAccess(campId, userId);
      if (!campAccess.valid) {
        return res.status(403).json({ error: campAccess.error });
      }
      productVersion = campAccess.camp.product_version;
    }

    const limitCheck = await checkCanCreateProject(user, {
      teamId,
      campId,
      productVersion,
    });
    if (!limitCheck.allowed) {
      return res.status(limitCheck.status || 403).json({ error: limitCheck.reason });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const projectResult = await client.query(
        `INSERT INTO projects (name, owner_id, team_id, camp_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [nameValidation.name, userId, teamId, campId]
      );
      const project = projectResult.rows[0];

      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [project.id, userId]
      );

      await client.query('COMMIT');

      res.status(201).json(formatProjectSummary(project, 'owner'));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const teamId = parseOptionalInt(req.query.team_id);
    const campId = parseOptionalInt(req.query.camp_id);

    if (Number.isNaN(teamId) || Number.isNaN(campId)) {
      return res.status(400).json({ error: 'Invalid team_id or camp_id' });
    }

    if (teamId != null && campId != null) {
      return res.status(400).json({ error: 'Cannot filter by both team_id and camp_id' });
    }

    const result = await pool.query(
      `SELECT p.*, pm.role
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
       WHERE ($2::int IS NULL OR p.team_id = $2)
         AND ($3::int IS NULL OR p.camp_id = $3)
       ORDER BY p.updated_at DESC, p.id DESC`,
      [userId, teamId, campId]
    );

    res.json({
      projects: result.rows.map((row) => formatProjectSummary(row)),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
