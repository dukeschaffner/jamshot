import express from 'express';
import { MAX_PROJECT_DURATION_SECONDS, MAX_PROJECT_TRACKS } from '@sterio/subscription-utils';
import pool from '../config/db.js';
import { betterAuthMiddleware as authMiddleware } from '../middleware/betterAuthMiddleware.js';
import { contentCreationLimiter } from '../middleware/rateLimiting.js';
import { requireProjectsFeature } from '../middleware/projectsFeatureMiddleware.js';
import { validateTeamAccess } from '../utils/teamUtils.js';
import { validateCampAccess } from '../utils/campUtils.js';
import {
  checkCanCreateProject,
  checkProjectAccess,
  hasMinimumProjectRole,
} from '../utils/projectAccess.js';
import { formatProjectSummary, serializeProjectState } from '../utils/projectUtils.js';

const router = express.Router();

router.use(requireProjectsFeature);
router.use(authMiddleware);

function parseOptionalInt(value) {
  if (value == null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function parseProjectId(rawId) {
  const parsed = parseInt(rawId, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function parseTrackId(rawId) {
  const parsed = parseInt(rawId, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function validateTrackName(name) {
  if (name == null || typeof name !== 'string') {
    return { valid: false, error: 'Track name is required' };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Track name is required' };
  }
  if (trimmed.length > 200) {
    return { valid: false, error: 'Track name must be 200 characters or less' };
  }
  return { valid: true, name: trimmed };
}

function parseBooleanField(value, fieldName) {
  if (typeof value === 'boolean') {
    return { valid: true, value };
  }
  if (value === 'true' || value === 1 || value === '1') {
    return { valid: true, value: true };
  }
  if (value === 'false' || value === 0 || value === '0') {
    return { valid: true, value: false };
  }
  return { valid: false, error: `${fieldName} must be a boolean` };
}

async function bumpProjectRevision(client, projectId, expectedRevision) {
  const result = await client.query(
    `UPDATE projects
     SET revision = revision + 1
     WHERE id = $1 AND revision = $2
     RETURNING revision`,
    [projectId, expectedRevision]
  );

  if (result.rows.length === 0) {
    const currentResult = await client.query(
      'SELECT revision FROM projects WHERE id = $1',
      [projectId]
    );
    const currentRevision =
      currentResult.rows.length > 0 ? Number(currentResult.rows[0].revision) : null;
    return { ok: false, currentRevision };
  }

  return { ok: true, revision: Number(result.rows[0].revision) };
}

function revisionMismatchResponse(res, currentRevision, yourRevision) {
  return res.status(409).json({
    error: 'REVISION_MISMATCH',
    current_revision: currentRevision,
    your_revision: yourRevision,
  });
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

function parseRequiredRevision(body) {
  const raw = body?.revision;
  if (raw == null || raw === '') {
    return { valid: false, error: 'revision is required' };
  }
  const parsed = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { valid: false, error: 'Invalid revision' };
  }
  return { valid: true, revision: parsed };
}

function validateTimeSignature(value) {
  if (value == null) {
    return { valid: false, error: 'time_signature must be a string' };
  }
  if (typeof value !== 'string') {
    return { valid: false, error: 'time_signature must be a string' };
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 10) {
    return { valid: false, error: 'time_signature must be 10 characters or less' };
  }
  if (!/^\d+\/\d+$/.test(trimmed)) {
    return { valid: false, error: 'time_signature must be in the form "4/4"' };
  }
  return { valid: true, timeSignature: trimmed };
}

function validateDurationSeconds(value) {
  if (value == null) {
    return { valid: false, error: 'duration_seconds is required' };
  }
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, error: 'duration_seconds must be a positive number' };
  }
  if (parsed > MAX_PROJECT_DURATION_SECONDS) {
    return {
      valid: false,
      error: `duration_seconds cannot exceed ${MAX_PROJECT_DURATION_SECONDS} seconds`,
    };
  }
  return { valid: true, durationSeconds: parsed };
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

router.get('/:id', async (req, res, next) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    const state = await serializeProjectState(projectId);
    if (!state) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

    res.json({ ...state, role: access.role });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    if (!hasMinimumProjectRole(access.role, 'editor')) {
      return res.status(403).json({ error: 'Editor access required' });
    }

    const revisionCheck = parseRequiredRevision(req.body);
    if (!revisionCheck.valid) {
      return res.status(400).json({ error: revisionCheck.error });
    }

    const {
      name,
      bpm,
      time_signature: timeSignatureRaw,
      metronome_offset: metronomeOffsetRaw,
      duration_seconds: durationSecondsRaw,
      duration: durationAlias,
    } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      const nameValidation = validateProjectName(name);
      if (!nameValidation.valid) {
        return res.status(400).json({ error: nameValidation.error });
      }
      updates.push(`name = $${paramIndex++}`);
      values.push(nameValidation.name);
    }

    if (bpm !== undefined) {
      if (bpm === null) {
        updates.push(`bpm = $${paramIndex++}`);
        values.push(null);
      } else {
        const parsedBpm = typeof bpm === 'string' ? parseInt(bpm, 10) : Number(bpm);
        if (!Number.isInteger(parsedBpm) || parsedBpm < 1 || parsedBpm > 999) {
          return res.status(400).json({ error: 'bpm must be an integer between 1 and 999' });
        }
        updates.push(`bpm = $${paramIndex++}`);
        values.push(parsedBpm);
      }
    }

    if (timeSignatureRaw !== undefined) {
      const tsValidation = validateTimeSignature(timeSignatureRaw);
      if (!tsValidation.valid) {
        return res.status(400).json({ error: tsValidation.error });
      }
      updates.push(`time_signature = $${paramIndex++}`);
      values.push(tsValidation.timeSignature);
    }

    if (metronomeOffsetRaw !== undefined) {
      const parsedOffset =
        typeof metronomeOffsetRaw === 'string'
          ? parseFloat(metronomeOffsetRaw)
          : Number(metronomeOffsetRaw);
      if (!Number.isFinite(parsedOffset)) {
        return res.status(400).json({ error: 'metronome_offset must be a number' });
      }
      updates.push(`metronome_offset = $${paramIndex++}`);
      values.push(parsedOffset);
    }

    const durationRaw =
      durationSecondsRaw !== undefined ? durationSecondsRaw : durationAlias;
    if (durationRaw !== undefined) {
      const durationValidation = validateDurationSeconds(durationRaw);
      if (!durationValidation.valid) {
        return res.status(400).json({ error: durationValidation.error });
      }
      updates.push(`duration_seconds = $${paramIndex++}`);
      values.push(durationValidation.durationSeconds);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push('revision = revision + 1');

    values.push(projectId, revisionCheck.revision);

    const result = await pool.query(
      `UPDATE projects
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND revision = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      const currentResult = await pool.query(
        'SELECT revision FROM projects WHERE id = $1',
        [projectId]
      );
      const currentRevision =
        currentResult.rows.length > 0 ? Number(currentResult.rows[0].revision) : null;

      return res.status(409).json({
        error: 'REVISION_MISMATCH',
        current_revision: currentRevision,
        your_revision: revisionCheck.revision,
      });
    }

    const state = await serializeProjectState(projectId);
    res.json({ ...state, role: access.role });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/tracks', async (req, res, next) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    if (!hasMinimumProjectRole(access.role, 'editor')) {
      return res.status(403).json({ error: 'Editor access required' });
    }

    const revisionCheck = parseRequiredRevision(req.body);
    if (!revisionCheck.valid) {
      return res.status(400).json({ error: revisionCheck.error });
    }

    const { name: nameRaw, sort_order: sortOrderRaw, color } = req.body;

    let trackName = null;
    if (nameRaw !== undefined) {
      const nameValidation = validateTrackName(nameRaw);
      if (!nameValidation.valid) {
        return res.status(400).json({ error: nameValidation.error });
      }
      trackName = nameValidation.name;
    }

    let sortOrder = null;
    if (sortOrderRaw !== undefined) {
      const parsedSortOrder =
        typeof sortOrderRaw === 'string' ? parseInt(sortOrderRaw, 10) : Number(sortOrderRaw);
      if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) {
        return res.status(400).json({ error: 'sort_order must be a non-negative integer' });
      }
      sortOrder = parsedSortOrder;
    }

    if (color !== undefined && color !== null) {
      if (typeof color !== 'string' || color.length > 20) {
        return res.status(400).json({ error: 'color must be a string of 20 characters or less' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const countResult = await client.query(
        'SELECT COUNT(*)::int AS count FROM project_tracks WHERE project_id = $1',
        [projectId]
      );
      const trackCount = countResult.rows[0].count;

      if (trackCount >= MAX_PROJECT_TRACKS) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: `Track limit reached (${trackCount}/${MAX_PROJECT_TRACKS})`,
        });
      }

      const revisionBump = await bumpProjectRevision(
        client,
        projectId,
        revisionCheck.revision
      );
      if (!revisionBump.ok) {
        await client.query('ROLLBACK');
        return revisionMismatchResponse(
          res,
          revisionBump.currentRevision,
          revisionCheck.revision
        );
      }

      if (sortOrder == null) {
        const sortResult = await client.query(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
           FROM project_tracks
           WHERE project_id = $1`,
          [projectId]
        );
        sortOrder = sortResult.rows[0].next_sort;
      }

      if (trackName == null) {
        trackName = `Track ${trackCount + 1}`;
      }

      const insertResult = await client.query(
        `INSERT INTO project_tracks (project_id, name, sort_order, color)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [projectId, trackName, sortOrder, color ?? null]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const state = await serializeProjectState(projectId);
    res.status(201).json({ ...state, role: access.role });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/tracks/:trackId', async (req, res, next) => {
  try {
    const projectId = parseProjectId(req.params.id);
    const trackId = parseTrackId(req.params.trackId);
    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }
    if (Number.isNaN(trackId)) {
      return res.status(400).json({ error: 'Invalid track id' });
    }

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    if (!hasMinimumProjectRole(access.role, 'editor')) {
      return res.status(403).json({ error: 'Editor access required' });
    }

    const revisionCheck = parseRequiredRevision(req.body);
    if (!revisionCheck.valid) {
      return res.status(400).json({ error: revisionCheck.error });
    }

    const trackResult = await pool.query(
      'SELECT id FROM project_tracks WHERE id = $1 AND project_id = $2',
      [trackId, projectId]
    );
    if (trackResult.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const {
      name,
      sort_order: sortOrderRaw,
      gain: gainRaw,
      is_muted: isMutedRaw,
      muted: mutedAlias,
      is_solo: isSoloRaw,
      solo: soloAlias,
      color,
    } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      const nameValidation = validateTrackName(name);
      if (!nameValidation.valid) {
        return res.status(400).json({ error: nameValidation.error });
      }
      updates.push(`name = $${paramIndex++}`);
      values.push(nameValidation.name);
    }

    if (sortOrderRaw !== undefined) {
      const parsedSortOrder =
        typeof sortOrderRaw === 'string' ? parseInt(sortOrderRaw, 10) : Number(sortOrderRaw);
      if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) {
        return res.status(400).json({ error: 'sort_order must be a non-negative integer' });
      }
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(parsedSortOrder);
    }

    if (gainRaw !== undefined) {
      const parsedGain = typeof gainRaw === 'string' ? parseFloat(gainRaw) : Number(gainRaw);
      if (!Number.isFinite(parsedGain) || parsedGain < 0) {
        return res.status(400).json({ error: 'gain must be a non-negative number' });
      }
      updates.push(`gain = $${paramIndex++}`);
      values.push(parsedGain);
    }

    const mutedRaw = isMutedRaw !== undefined ? isMutedRaw : mutedAlias;
    if (mutedRaw !== undefined) {
      const mutedCheck = parseBooleanField(mutedRaw, 'is_muted');
      if (!mutedCheck.valid) {
        return res.status(400).json({ error: mutedCheck.error });
      }
      updates.push(`is_muted = $${paramIndex++}`);
      values.push(mutedCheck.value);
    }

    const soloRaw = isSoloRaw !== undefined ? isSoloRaw : soloAlias;
    if (soloRaw !== undefined) {
      const soloCheck = parseBooleanField(soloRaw, 'is_solo');
      if (!soloCheck.valid) {
        return res.status(400).json({ error: soloCheck.error });
      }
      updates.push(`is_solo = $${paramIndex++}`);
      values.push(soloCheck.value);
    }

    if (color !== undefined) {
      if (color !== null && (typeof color !== 'string' || color.length > 20)) {
        return res.status(400).json({ error: 'color must be a string of 20 characters or less' });
      }
      updates.push(`color = $${paramIndex++}`);
      values.push(color);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const revisionBump = await bumpProjectRevision(
        client,
        projectId,
        revisionCheck.revision
      );
      if (!revisionBump.ok) {
        await client.query('ROLLBACK');
        return revisionMismatchResponse(
          res,
          revisionBump.currentRevision,
          revisionCheck.revision
        );
      }

      values.push(trackId, projectId);

      const updateResult = await client.query(
        `UPDATE project_tracks
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex++} AND project_id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Track not found' });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const state = await serializeProjectState(projectId);
    res.json({ ...state, role: access.role });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/tracks/:trackId', async (req, res, next) => {
  try {
    const projectId = parseProjectId(req.params.id);
    const trackId = parseTrackId(req.params.trackId);
    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }
    if (Number.isNaN(trackId)) {
      return res.status(400).json({ error: 'Invalid track id' });
    }

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    if (!hasMinimumProjectRole(access.role, 'editor')) {
      return res.status(403).json({ error: 'Editor access required' });
    }

    const revisionCheck = parseRequiredRevision(req.body);
    if (!revisionCheck.valid) {
      return res.status(400).json({ error: revisionCheck.error });
    }

    const trackResult = await pool.query(
      'SELECT id FROM project_tracks WHERE id = $1 AND project_id = $2',
      [trackId, projectId]
    );
    if (trackResult.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const revisionBump = await bumpProjectRevision(
        client,
        projectId,
        revisionCheck.revision
      );
      if (!revisionBump.ok) {
        await client.query('ROLLBACK');
        return revisionMismatchResponse(
          res,
          revisionBump.currentRevision,
          revisionCheck.revision
        );
      }

      await client.query(
        `UPDATE project_clips
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE project_track_id = $1 AND deleted_at IS NULL`,
        [trackId]
      );

      const clipCountResult = await client.query(
        'SELECT COUNT(*)::int AS count FROM project_clips WHERE project_track_id = $1',
        [trackId]
      );
      const clipCount = clipCountResult.rows[0].count;

      if (clipCount === 0) {
        await client.query(
          'DELETE FROM project_tracks WHERE id = $1 AND project_id = $2',
          [trackId, projectId]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const state = await serializeProjectState(projectId);
    res.json({ ...state, role: access.role });
  } catch (err) {
    next(err);
  }
});

export default router;
