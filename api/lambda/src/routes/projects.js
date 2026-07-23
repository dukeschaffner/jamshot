import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as mm from 'music-metadata';
import { MAX_PROJECT_DURATION_SECONDS, MAX_PROJECT_TRACKS } from '@sterio/subscription-utils';
import pool from '../config/db.js';
import { betterAuthMiddleware as authMiddleware } from '../middleware/betterAuthMiddleware.js';
import { contentCreationLimiter, uploadLimiter } from '../middleware/rateLimiting.js';
import { requireProjectsFeature } from '../middleware/projectsFeatureMiddleware.js';
import { validateTeamAccess } from '../utils/teamUtils.js';
import { validateCampAccess } from '../utils/campUtils.js';
import {
  checkCanCreateProject,
  checkProjectAccess,
  getProjectLimitsForContext,
  hasMinimumProjectRole,
  PROJECT_ACTIVE_CONTEXT_WHERE,
  resolveProjectRef,
} from '../utils/projectAccess.js';
import { countActiveProjectTracks } from '../utils/countActiveProjectTracks.js';
import {
  formatProjectSummary,
  sanitizeProcessingError,
  serializeProjectState,
} from '../utils/projectUtils.js';
import {
  createManualProjectSnapshot,
  listProjectSnapshots,
  validateSnapshotLabel,
} from '../utils/projectSnapshotUtils.js';
import { getActiveUploadBan, checkTrackAccess } from '../utils/trackUtils.js';
import {
  buildProjectAssetTempKey,
  uploadLocalFileToR2,
  emitProjectAssetCreatedEvent,
} from '../utils/projectAssetUtils.js';
import {
  deleteProjectAsset,
  listProjectAssets,
  parseAssetDeleteConfirm,
  parseAssetPlacementBody,
  placeProjectAssetClip,
} from '../utils/projectAssetLibraryUtils.js';
import {
  checkProjectStorageLimit,
  getProjectStorageUsage,
} from '../utils/projectStorageLimit.js';
import { assertTracksNotLockedByOther } from '../utils/projectTrackLocks.js';
import {
  leaveProject,
  listProjectMembers,
  removeProjectMember,
  updateProjectMemberRole,
} from '../services/projectMemberService.js';
import {
  acceptProjectInvite,
  createProjectInvite,
  declineProjectInvite,
  getProjectInviteByToken,
  listProjectInvites,
  revokeProjectInvite,
} from '../services/projectInviteService.js';
import { deleteProjectAsOwner } from '../services/projectDeleteService.js';
import {
  importTrackIntoProject,
  isGuid,
} from '../services/projectImportService.js';
import { notifyLineageContributorsOfProject } from '../services/projectFromTrackNotifyService.js';
import {
  createProjectCollabAsset,
  listProjectCollabTracks,
  listProjectCollabUsers,
} from '../services/projectCollabTreeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clipUploadTempDir =
  process.env.NODE_ENV !== 'dev' ? '/tmp' : path.join(__dirname, '../../temp');

const router = express.Router();

const clipUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(clipUploadTempDir)) {
        fs.mkdirSync(clipUploadTempDir, { recursive: true });
      }
      cb(null, clipUploadTempDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${file.originalname}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function handleClipMulterError(error, req, res, next) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  if (error) {
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  next();
}

async function getAudioMetadataParser() {
  if (typeof mm.parseFile === 'function') {
    return mm;
  }
  if (typeof mm.loadMusicMetadata === 'function') {
    return await mm.loadMusicMetadata();
  }
  throw new Error('No parseFile or loadMusicMetadata found in music-metadata');
}

router.use(requireProjectsFeature);
router.use(authMiddleware);

function parseOptionalInt(value) {
  if (value == null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

async function resolveProjectRouteParam(req, res) {
  const resolved = await resolveProjectRef(req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.error });
    return null;
  }
  return resolved.projectId;
}

function parseTrackId(rawId) {
  const parsed = parseInt(rawId, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function parseClipId(rawId) {
  const parsed = parseInt(rawId, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

async function enforceTrackLocks(res, projectId, userId, trackIds) {
  const lockCheck = await assertTracksNotLockedByOther({ projectId, trackIds, userId });
  if (!lockCheck.ok) {
    res.status(403).json({ error: lockCheck.message, code: lockCheck.code });
    return false;
  }
  return true;
}

function parseAssetId(rawId) {
  const parsed = parseInt(rawId, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function parsePlacementSeconds(value, fieldName, { required = false, min = 0 } = {}) {
  if (value == null || value === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, value: min };
  }

  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    return { valid: false, error: `${fieldName} must be a number >= ${min}` };
  }

  return { valid: true, value: parsed };
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

function computeClipPlaybackDuration(trimStart, trimEnd, assetDuration) {
  const start = trimStart ?? 0;
  if (trimEnd != null) {
    return trimEnd - start;
  }
  if (assetDuration != null) {
    return assetDuration - start;
  }
  return null;
}

function clipsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

async function findOverlappingClipOnTrack(
  client,
  trackId,
  excludeClipId,
  startTime,
  endTime
) {
  const result = await client.query(
    `SELECT pc.id, pc.start_time_seconds, pc.trim_start_seconds, pc.trim_end_seconds,
            pa.duration_seconds AS asset_duration
     FROM project_clips pc
     JOIN project_assets pa ON pa.id = pc.asset_id
     WHERE pc.project_track_id = $1
       AND pc.deleted_at IS NULL
       AND pc.id != $2`,
    [trackId, excludeClipId]
  );

  for (const row of result.rows) {
    const duration = computeClipPlaybackDuration(
      row.trim_start_seconds,
      row.trim_end_seconds,
      row.asset_duration != null ? Number(row.asset_duration) : null
    );
    if (duration == null || duration <= 0) continue;

    const clipStart = Number(row.start_time_seconds);
    const clipEnd = clipStart + duration;
    if (clipsOverlap(startTime, endTime, clipStart, clipEnd)) {
      return row.id;
    }
  }

  return null;
}

async function validateClipPlacement(
  client,
  {
    trackId,
    clipId,
    startTime,
    trimStart,
    trimEnd,
    assetDuration,
    projectDuration,
    assetProjectId,
    trackProjectId,
  }
) {
  if (assetProjectId !== trackProjectId) {
    return { valid: false, error: 'Asset does not belong to this project' };
  }

  const duration = computeClipPlaybackDuration(trimStart, trimEnd, assetDuration);
  if (duration == null || duration <= 0) {
    return { valid: false, error: 'Clip duration must be greater than 0' };
  }

  if (trimEnd != null && trimEnd <= trimStart) {
    return { valid: false, error: 'trim_end_seconds must be greater than trim_start_seconds' };
  }

  const clipEndOnTimeline = startTime + duration;
  if (clipEndOnTimeline > projectDuration) {
    return {
      valid: false,
      error: `Clip extends beyond project duration (${projectDuration}s)`,
    };
  }

  const overlappingClipId = await findOverlappingClipOnTrack(
    client,
    trackId,
    clipId,
    startTime,
    clipEndOnTimeline
  );
  if (overlappingClipId != null) {
    return { valid: false, error: 'Clip overlaps another clip on this track' };
  }

  return { valid: true, duration };
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

// --- Invite token routes (must be before /:id routes) ---

router.get('/invites/:token', async (req, res, next) => {
  try {
    const result = await getProjectInviteByToken(req.params.token, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ invite: result.invite });
  } catch (err) {
    next(err);
  }
});

router.post('/invites/:token/accept', async (req, res, next) => {
  try {
    const result = await acceptProjectInvite(req.params.token, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({
      message: result.alreadyMember ? 'Already a member' : 'Joined project',
      projectGuid: result.projectGuid,
      role: result.role,
      alreadyMember: result.alreadyMember,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/invites/:token/decline', async (req, res, next) => {
  try {
    const result = await declineProjectInvite(req.params.token, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ message: 'Invite declined' });
  } catch (err) {
    next(err);
  }
});

// --- Members ---

router.get('/:id/members', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const result = await listProjectMembers(projectId, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ members: result.members });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/members/:userId', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const result = await updateProjectMemberRole(
      projectId,
      req.user.id,
      req.params.userId,
      req.body?.role
    );
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ message: 'Member role updated', role: result.role });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const result = await removeProjectMember(
      projectId,
      req.user.id,
      req.params.userId
    );
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ message: 'Member removed' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/members/leave', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const result = await leaveProject(projectId, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ message: 'Left project' });
  } catch (err) {
    next(err);
  }
});

// --- Project invites (admin+) ---

router.get('/:id/invites', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const result = await listProjectInvites(projectId, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ invites: result.invites });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/invites', contentCreationLimiter, async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const result = await createProjectInvite(projectId, req.user.id, {
      userId: req.body?.userId,
      role: req.body?.role,
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.status(201).json({ invite: result.invite });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/invites/:inviteId', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const inviteId = parseInt(req.params.inviteId, 10);
    if (Number.isNaN(inviteId)) {
      return res.status(400).json({ error: 'Invalid invite id' });
    }

    const result = await revokeProjectInvite(projectId, req.user.id, inviteId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ message: 'Invite revoked' });
  } catch (err) {
    next(err);
  }
});

// --- Delete project (owner only) ---

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteProjectAsOwner(req.params.id, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ message: 'Project deleted', projectGuid: result.projectGuid });
  } catch (err) {
    next(err);
  }
});

router.post('/', contentCreationLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      name,
      team_id: teamIdRaw,
      camp_id: campIdRaw,
      source_track_id: sourceTrackIdRaw,
    } = req.body;

    const nameValidation = validateProjectName(name);
    if (!nameValidation.valid) {
      return res.status(400).json({ error: nameValidation.error });
    }

    const teamId = parseOptionalInt(teamIdRaw);
    const campId = parseOptionalInt(campIdRaw);
    const sourceTrackId =
      sourceTrackIdRaw == null || sourceTrackIdRaw === ''
        ? null
        : sourceTrackIdRaw;

    if (Number.isNaN(teamId) || Number.isNaN(campId)) {
      return res.status(400).json({ error: 'Invalid team_id or camp_id' });
    }

    if (teamId != null && campId != null) {
      return res.status(400).json({ error: 'Cannot set both team_id and camp_id' });
    }

    if (
      sourceTrackId != null &&
      !isGuid(String(sourceTrackId)) &&
      Number.isNaN(parseInt(sourceTrackId, 10))
    ) {
      return res.status(400).json({ error: 'Invalid source_track_id' });
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
      const body = { error: limitCheck.reason };
      if (limitCheck.upgrade_link) {
        body.upgrade_link = limitCheck.upgrade_link;
      }
      return res.status(limitCheck.status || 403).json(body);
    }

    // Verify track access BEFORE checking out a pool client. The API pool
    // max is 1 — nested pool.query inside a held transaction deadlocks.
    if (sourceTrackId != null) {
      const trackAccess = await checkTrackAccess(sourceTrackId, userId);
      if (!trackAccess.hasAccess) {
        return res.status(trackAccess.status).json({ error: trackAccess.error });
      }
    }

    const client = await pool.connect();
    let createdProject = null;
    let importResult = null;
    try {
      await client.query('BEGIN');

      const projectResult = await client.query(
        `INSERT INTO projects (name, owner_id, team_id, camp_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [nameValidation.name, userId, teamId, campId]
      );
      createdProject = projectResult.rows[0];

      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [createdProject.id, userId]
      );

      if (sourceTrackId != null) {
        importResult = await importTrackIntoProject(
          client,
          createdProject,
          sourceTrackId,
          userId,
          { accessVerified: true }
        );
        createdProject = importResult.project;
      } else {
        // Blank projects start with one empty track (from-track imports create their own)
        await client.query(
          `INSERT INTO project_tracks (project_id, name, sort_order)
           VALUES ($1, $2, $3)`,
          [createdProject.id, 'Track 1', 0]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.userFacing && err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    } finally {
      client.release();
    }

    if (importResult?.sourceTrack) {
      // Fire-and-forget lineage emails — do not block the response
      notifyLineageContributorsOfProject({
        sourceTrackId: importResult.sourceTrack.id,
        sourceTrackGuid: importResult.sourceTrack.guid,
        sourceTrackTitle: importResult.sourceTrack.title,
        projectName: createdProject.name,
        creatorUserId: userId,
      }).catch((err) => {
        console.error('Lineage notify failed after project create:', err);
      });
    }

    res.status(201).json(formatProjectSummary(createdProject, 'owner'));
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
      `SELECT p.*, pm.role, t.name AS team_name, c.name AS camp_name
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN camps c ON c.id = p.camp_id
       WHERE ($2::int IS NULL OR p.team_id = $2)
         AND ($3::int IS NULL OR p.camp_id = $3)
         ${PROJECT_ACTIVE_CONTEXT_WHERE}
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

router.get('/:id/snapshots', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    const snapshots = await listProjectSnapshots(projectId);
    res.json({ snapshots });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/snapshots', contentCreationLimiter, async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    if (!hasMinimumProjectRole(access.role, 'editor')) {
      return res.status(403).json({ error: 'Editor access required' });
    }

    const labelValidation = validateSnapshotLabel(req.body?.label);
    if (!labelValidation.valid) {
      return res.status(400).json({ error: labelValidation.error });
    }

    const snapshot = await createManualProjectSnapshot({
      projectId,
      userId: req.user.id,
      label: labelValidation.label,
    });

    if (!snapshot) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

    res.status(201).json(snapshot);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/plugin-payload', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    if (!hasMinimumProjectRole(access.role, 'editor')) {
      return res.status(403).json({ error: 'Editor access required' });
    }

    const payload = await serializeProjectState(projectId, { variant: 'plugin' });
    if (!payload) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

    await pool.query(
      `UPDATE project_assets pa
       SET last_referenced_at = CURRENT_TIMESTAMP
       FROM project_clips pc
       JOIN project_tracks pt ON pt.id = pc.project_track_id
       WHERE pa.id = pc.asset_id
         AND pt.project_id = $1
         AND pc.deleted_at IS NULL
         AND pa.deleted_at IS NULL
         AND pa.processing_status = 'completed'`,
      [projectId]
    );

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

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

router.get('/:id/assets', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    const [assets, usedBytes, limits] = await Promise.all([
      listProjectAssets(projectId),
      getProjectStorageUsage(pool, projectId),
      getProjectLimitsForContext(access.project, req.user),
    ]);

    res.json({
      assets,
      role: access.role,
      storage: {
        usedBytes,
        maxBytes: limits.max_project_storage_bytes,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/collab-tracks', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const result = await listProjectCollabTracks(projectId, req.user.id, req.query);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({
      tracks: result.tracks,
      nextCursor: result.nextCursor,
      sourceRootId: result.sourceRootId,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/collab-users', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const result = await listProjectCollabUsers(projectId, req.user.id, req.query);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({
      users: result.users,
      nextCursor: result.nextCursor,
      sourceRootId: result.sourceRootId,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/collab-assets', contentCreationLimiter, async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

    const trackId = req.body?.track_id ?? req.body?.trackId;
    const result = await createProjectCollabAsset(projectId, req.user.id, trackId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(result.created ? 201 : 200).json({
      asset: result.asset,
      created: result.created,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/assets/:assetId', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;
    const assetId = parseAssetId(req.params.assetId);
    if (Number.isNaN(assetId)) {
      return res.status(400).json({ error: 'Invalid asset id' });
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

    const result = await deleteProjectAsset({
      projectId,
      assetId,
      userId: req.user.id,
      revision: revisionCheck.revision,
      confirm: parseAssetDeleteConfirm(req),
    });

    if (!result.ok) {
      const payload = { error: result.error };
      if (result.code) payload.code = result.code;
      if (result.requiresConfirm) payload.requiresConfirm = true;
      if (result.currentRevision != null) {
        payload.currentRevision = result.currentRevision;
        payload.yourRevision = revisionCheck.revision;
      }
      return res.status(result.status).json(payload);
    }

    const state = await serializeProjectState(projectId);
    res.json({ ...state, role: access.role });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/assets/:assetId/clips', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;
    const assetId = parseAssetId(req.params.assetId);
    if (Number.isNaN(assetId)) {
      return res.status(400).json({ error: 'Invalid asset id' });
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

    const placement = parseAssetPlacementBody(req.body);
    if (!placement.valid) {
      return res.status(400).json({ error: placement.error });
    }

    const result = await placeProjectAssetClip({
      projectId,
      assetId,
      userId: req.user.id,
      revision: revisionCheck.revision,
      trackId: placement.trackId,
      startTime: placement.startTime,
      trimStart: placement.trimStart,
      trimEnd: placement.trimEnd,
    });

    if (!result.ok) {
      const payload = { error: result.error };
      if (result.code) payload.code = result.code;
      if (result.currentRevision != null) {
        payload.currentRevision = result.currentRevision;
        payload.yourRevision = revisionCheck.revision;
      }
      return res.status(result.status).json(payload);
    }

    const state = await serializeProjectState(projectId);
    res.json({ ...state, role: access.role, clipId: result.clipId });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/assets/:assetId/processing-status', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;
    const assetId = parseAssetId(req.params.assetId);

    if (Number.isNaN(assetId)) {
      return res.status(400).json({ error: 'Invalid asset id' });
    }

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.hasAccess) {
      return res.status(access.status).json({ error: access.error });
    }

    const result = await pool.query(
      `SELECT processing_status, processing_error, created_at
       FROM project_assets
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [assetId, projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const asset = result.rows[0];
    const status = asset.processing_status || 'pending';

    let estimatedTimeRemaining = null;
    if (status === 'pending' || status === 'processing') {
      const createdAt = new Date(asset.created_at);
      const elapsedMs = Date.now() - createdAt.getTime();
      const estimatedTotalMs = 5 * 60 * 1000;
      const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);
      if (remainingMs > 0) {
        estimatedTimeRemaining = Math.ceil(remainingMs / 1000);
      }
    }

    const sanitizedError =
      status === 'failed' && asset.processing_error
        ? sanitizeProcessingError(asset.processing_error)
        : null;

    res.json({
      asset_id: assetId,
      status,
      error: sanitizedError,
      estimated_time_remaining: estimatedTimeRemaining,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

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
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;

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

      const trackCount = await countActiveProjectTracks(client, projectId);

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
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;
    const trackId = parseTrackId(req.params.trackId);
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

    if (!(await enforceTrackLocks(res, projectId, req.user.id, [trackId]))) {
      return;
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
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;
    const trackId = parseTrackId(req.params.trackId);
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

    if (!(await enforceTrackLocks(res, projectId, req.user.id, [trackId]))) {
      return;
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

router.post(
  '/:id/tracks/:trackId/clips',
  uploadLimiter,
  (req, res, next) => {
    clipUpload.single('file')(req, res, (err) => {
      if (err) return handleClipMulterError(err, req, res, next);
      next();
    });
  },
  async (req, res, next) => {
    let localFilePath = req.file?.path ?? null;

    try {
      const userId = req.user.id;
      const projectId = await resolveProjectRouteParam(req, res);
      if (projectId == null) return;
      const trackId = parseTrackId(req.params.trackId);

      if (Number.isNaN(trackId)) {
        return res.status(400).json({ error: 'Invalid track id' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      const activeUploadBan = await getActiveUploadBan(userId);
      if (activeUploadBan) {
        return res.status(403).json({
          error: 'USER_BANNED',
          ban_type: activeUploadBan.ban_type,
          message: activeUploadBan.reason
            ? `You are temporarily blocked from uploading due to ${activeUploadBan.reason.toLowerCase()}.`
            : 'You are temporarily blocked from uploading.',
          expires_at: activeUploadBan.expires_at,
        });
      }

      const access = await checkProjectAccess(projectId, userId);
      if (!access.hasAccess) {
        return res.status(access.status).json({ error: access.error });
      }

      if (!hasMinimumProjectRole(access.role, 'editor')) {
        return res.status(403).json({ error: 'Editor access required' });
      }

      const storageCheck = await checkProjectStorageLimit(
        access.project,
        req.user,
        req.file.size
      );
      if (!storageCheck.allowed) {
        const payload = {
          error: storageCheck.reason,
          usedBytes: storageCheck.usedBytes,
          maxBytes: storageCheck.maxBytes,
        };
        if (storageCheck.upgrade_link) {
          payload.upgrade_link = storageCheck.upgrade_link;
        }
        return res.status(storageCheck.status).json(payload);
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

      if (!(await enforceTrackLocks(res, projectId, userId, [trackId]))) {
        return;
      }

      const projectDuration = Number(access.project.duration_seconds ?? 0);

      const startTimeCheck = parsePlacementSeconds(
        req.body.start_time_seconds,
        'start_time_seconds',
        { required: true }
      );
      if (!startTimeCheck.valid) {
        return res.status(400).json({ error: startTimeCheck.error });
      }

      const trimStartCheck = parsePlacementSeconds(
        req.body.trim_start_seconds,
        'trim_start_seconds'
      );
      if (!trimStartCheck.valid) {
        return res.status(400).json({ error: trimStartCheck.error });
      }

      let trimEnd = null;
      if (req.body.trim_end_seconds != null && req.body.trim_end_seconds !== '') {
        const trimEndCheck = parsePlacementSeconds(
          req.body.trim_end_seconds,
          'trim_end_seconds'
        );
        if (!trimEndCheck.valid) {
          return res.status(400).json({ error: trimEndCheck.error });
        }
        trimEnd = trimEndCheck.value;
        if (trimEnd <= trimStartCheck.value) {
          return res.status(400).json({
            error: 'trim_end_seconds must be greater than trim_start_seconds',
          });
        }
      }

      localFilePath = req.file.path;
      const parser = await getAudioMetadataParser();
      const metadata = await parser.parseFile(localFilePath);
      const fileDuration = metadata.format.duration;

      if (!fileDuration || !Number.isFinite(fileDuration) || fileDuration <= 0) {
        return res.status(400).json({ error: 'Could not determine audio file duration' });
      }

      if (fileDuration > MAX_PROJECT_DURATION_SECONDS) {
        return res.status(400).json({
          error: `Audio duration cannot exceed ${MAX_PROJECT_DURATION_SECONDS} seconds`,
        });
      }

      const clipDuration =
        trimEnd != null ? trimEnd - trimStartCheck.value : fileDuration - trimStartCheck.value;

      if (clipDuration <= 0) {
        return res.status(400).json({ error: 'Clip duration must be greater than 0' });
      }

      const clipEndOnTimeline = startTimeCheck.value + clipDuration;
      if (clipEndOnTimeline > projectDuration) {
        return res.status(400).json({
          error: `Clip extends beyond project duration (${projectDuration}s)`,
        });
      }

      const clipIdRaw = req.body.clip_id;
      let existingClipId = null;
      if (clipIdRaw != null && clipIdRaw !== '') {
        existingClipId = parseClipId(clipIdRaw);
        if (Number.isNaN(existingClipId)) {
          return res.status(400).json({ error: 'Invalid clip_id' });
        }
      }

      const client = await pool.connect();
      let assetId;
      let clipId;
      let tempStorageKey;
      let newRevision;

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
        newRevision = revisionBump.revision;

        const assetInsert = await client.query(
          `INSERT INTO project_assets (
             project_id, storage_key, name, duration_seconds, file_size_bytes, mime_type,
             uploaded_by, processing_status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
           RETURNING id`,
          [
            projectId,
            'pending',
            req.file.originalname || null,
            fileDuration,
            req.file.size,
            req.file.mimetype || null,
            userId,
          ]
        );
        assetId = assetInsert.rows[0].id;

        tempStorageKey = buildProjectAssetTempKey(
          projectId,
          assetId,
          req.file.originalname
        );
        await client.query(
          `UPDATE project_assets
           SET storage_key = $1, last_referenced_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [tempStorageKey, assetId]
        );

        if (existingClipId != null) {
          const clipUpdate = await client.query(
            `UPDATE project_clips
             SET asset_id = $1,
                 start_time_seconds = $2,
                 trim_start_seconds = $3,
                 trim_end_seconds = $4,
                 deleted_at = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
               AND project_track_id = $6
               AND deleted_at IS NULL
             RETURNING id`,
            [
              assetId,
              startTimeCheck.value,
              trimStartCheck.value,
              trimEnd,
              existingClipId,
              trackId,
            ]
          );

          if (clipUpdate.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Clip not found' });
          }

          clipId = clipUpdate.rows[0].id;
        } else {
          const clipInsert = await client.query(
            `INSERT INTO project_clips (
               project_track_id, asset_id, start_time_seconds,
               trim_start_seconds, trim_end_seconds
             )
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [trackId, assetId, startTimeCheck.value, trimStartCheck.value, trimEnd]
          );
          clipId = clipInsert.rows[0].id;
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      try {
        await uploadLocalFileToR2(
          localFilePath,
          tempStorageKey,
          req.file.mimetype || 'audio/*'
        );
      } catch (uploadErr) {
        console.error('Project clip R2 upload failed:', uploadErr);
        await pool.query(
          `UPDATE project_assets
           SET processing_status = 'failed',
               processing_error = $1
           WHERE id = $2`,
          [uploadErr.message || 'R2 upload failed', assetId]
        );
        return res.status(500).json({ error: 'Failed to upload audio file' });
      }

      try {
        await emitProjectAssetCreatedEvent({
          assetId,
          projectId,
          s3Key: tempStorageKey,
          correlationId: req.correlationId,
        });
      } catch (eventErr) {
        console.error('Failed to emit project_asset_created event:', eventErr);
      }

      res.status(201).json({
        assetId,
        clipId,
        processing_status: 'pending',
        revision: newRevision,
      });
    } catch (err) {
      next(err);
    } finally {
      if (localFilePath) {
        await fsPromises.unlink(localFilePath).catch(() => {});
      }
    }
  }
);

router.patch('/:id/clips/:clipId', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;
    const clipId = parseClipId(req.params.clipId);
    if (Number.isNaN(clipId)) {
      return res.status(400).json({ error: 'Invalid clip id' });
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
      start_time_seconds: startTimeRaw,
      start_time: startTimeAlias,
      trim_start_seconds: trimStartRaw,
      trim_start: trimStartAlias,
      trim_end_seconds: trimEndRaw,
      trim_end: trimEndAlias,
      project_track_id: projectTrackIdRaw,
    } = req.body;

    const hasStartTime = startTimeRaw !== undefined || startTimeAlias !== undefined;
    const hasTrimStart = trimStartRaw !== undefined || trimStartAlias !== undefined;
    const hasTrimEnd = trimEndRaw !== undefined || trimEndAlias !== undefined;
    const hasTrackMove = projectTrackIdRaw !== undefined;

    if (!hasStartTime && !hasTrimStart && !hasTrimEnd && !hasTrackMove) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const clipResult = await client.query(
        `SELECT pc.id, pc.project_track_id, pc.start_time_seconds,
                pc.trim_start_seconds, pc.trim_end_seconds, pc.asset_id,
                pa.duration_seconds AS asset_duration, pa.project_id AS asset_project_id,
                pt.project_id AS track_project_id,
                p.duration_seconds AS project_duration
         FROM project_clips pc
         JOIN project_tracks pt ON pt.id = pc.project_track_id
         JOIN project_assets pa ON pa.id = pc.asset_id
         JOIN projects p ON p.id = pt.project_id
         WHERE pc.id = $1
           AND pt.project_id = $2
           AND pc.deleted_at IS NULL`,
        [clipId, projectId]
      );

      if (clipResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Clip not found' });
      }

      const existing = clipResult.rows[0];
      const sourceTrackId = Number(existing.project_track_id);

      let targetTrackId = sourceTrackId;
      if (hasTrackMove) {
        const parsedTrackId = parseTrackId(projectTrackIdRaw);
        if (Number.isNaN(parsedTrackId)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid project_track_id' });
        }

        const targetTrackResult = await client.query(
          'SELECT id, project_id FROM project_tracks WHERE id = $1 AND project_id = $2',
          [parsedTrackId, projectId]
        );
        if (targetTrackResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Target track not found' });
        }

        targetTrackId = parsedTrackId;
      }

      const lockTrackIds =
        targetTrackId !== sourceTrackId
          ? [Math.min(sourceTrackId, targetTrackId), Math.max(sourceTrackId, targetTrackId)]
          : [sourceTrackId];
      const lockCheck = await assertTracksNotLockedByOther({
        projectId,
        trackIds: lockTrackIds,
        userId: req.user.id,
        client,
      });
      if (!lockCheck.ok) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: lockCheck.message, code: lockCheck.code });
      }

      const projectDuration = Number(existing.project_duration);
      const assetDuration =
        existing.asset_duration != null ? Number(existing.asset_duration) : null;

      let startTime = Number(existing.start_time_seconds);
      if (hasStartTime) {
        const startTimeCheck = parsePlacementSeconds(
          startTimeRaw !== undefined ? startTimeRaw : startTimeAlias,
          'start_time_seconds',
          { required: true }
        );
        if (!startTimeCheck.valid) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: startTimeCheck.error });
        }
        startTime = startTimeCheck.value;
      }

      let trimStart = Number(existing.trim_start_seconds ?? 0);
      if (hasTrimStart) {
        const trimStartCheck = parsePlacementSeconds(
          trimStartRaw !== undefined ? trimStartRaw : trimStartAlias,
          'trim_start_seconds'
        );
        if (!trimStartCheck.valid) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: trimStartCheck.error });
        }
        trimStart = trimStartCheck.value;
      }

      let trimEnd = existing.trim_end_seconds;
      if (hasTrimEnd) {
        const trimEndValue = trimEndRaw !== undefined ? trimEndRaw : trimEndAlias;
        if (trimEndValue == null || trimEndValue === '') {
          trimEnd = null;
        } else {
          const trimEndCheck = parsePlacementSeconds(trimEndValue, 'trim_end_seconds');
          if (!trimEndCheck.valid) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: trimEndCheck.error });
          }
          trimEnd = trimEndCheck.value;
        }
      }

      const placementCheck = await validateClipPlacement(client, {
        trackId: targetTrackId,
        clipId,
        startTime,
        trimStart,
        trimEnd,
        assetDuration,
        projectDuration,
        assetProjectId: existing.asset_project_id,
        trackProjectId: projectId,
      });
      if (!placementCheck.valid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: placementCheck.error });
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

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (hasStartTime) {
        updates.push(`start_time_seconds = $${paramIndex++}`);
        values.push(startTime);
      }
      if (hasTrimStart) {
        updates.push(`trim_start_seconds = $${paramIndex++}`);
        values.push(trimStart);
      }
      if (hasTrimEnd) {
        updates.push(`trim_end_seconds = $${paramIndex++}`);
        values.push(trimEnd);
      }
      if (hasTrackMove) {
        updates.push(`project_track_id = $${paramIndex++}`);
        values.push(targetTrackId);
      }

      values.push(clipId);

      const updateResult = await client.query(
        `UPDATE project_clips
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND deleted_at IS NULL
         RETURNING id`,
        values
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Clip not found' });
      }

      await client.query(
        `UPDATE project_assets
         SET last_referenced_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [existing.asset_id]
      );

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

router.delete('/:id/clips/:clipId', async (req, res, next) => {
  try {
    const projectId = await resolveProjectRouteParam(req, res);
    if (projectId == null) return;
    const clipId = parseClipId(req.params.clipId);
    if (Number.isNaN(clipId)) {
      return res.status(400).json({ error: 'Invalid clip id' });
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

    const clipTrackResult = await pool.query(
      `SELECT pc.project_track_id
       FROM project_clips pc
       JOIN project_tracks pt ON pt.id = pc.project_track_id
       WHERE pc.id = $1 AND pt.project_id = $2 AND pc.deleted_at IS NULL`,
      [clipId, projectId]
    );
    if (clipTrackResult.rows.length === 0) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    const clipTrackId = Number(clipTrackResult.rows[0].project_track_id);
    if (!(await enforceTrackLocks(res, projectId, req.user.id, [clipTrackId]))) {
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const clipResult = await client.query(
        `SELECT pc.id
         FROM project_clips pc
         JOIN project_tracks pt ON pt.id = pc.project_track_id
         WHERE pc.id = $1
           AND pt.project_id = $2
           AND pc.deleted_at IS NULL`,
        [clipId, projectId]
      );

      if (clipResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Clip not found' });
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

      const deleteResult = await client.query(
        `UPDATE project_clips
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [clipId]
      );

      if (deleteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Clip not found' });
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
