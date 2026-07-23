import pool from '../config/db.js';
import {
  checkProjectAccess,
  hasMinimumProjectRole,
} from '../utils/projectAccess.js';
import { getProjectAssetPublicUrl } from '../utils/projectUtils.js';
import { copySingleTrackAsset } from './projectImportService.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseCursor(raw) {
  if (raw == null || raw === '') return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseLimit(raw) {
  if (raw == null || raw === '') return DEFAULT_LIMIT;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function toPublicTrackUrl(key) {
  if (!key) return null;
  if (key.startsWith('http://') || key.startsWith('https://')) return key;
  return getProjectAssetPublicUrl(key);
}

async function requireProjectMember(projectId, userId) {
  const access = await checkProjectAccess(projectId, userId);
  if (!access.hasAccess) {
    return { ok: false, status: access.status, error: access.error };
  }
  return { ok: true, access };
}

async function requireProjectEditor(projectId, userId) {
  const member = await requireProjectMember(projectId, userId);
  if (!member.ok) return member;
  if (!hasMinimumProjectRole(member.access.role, 'editor')) {
    return { ok: false, status: 403, error: 'Editor access required' };
  }
  return member;
}

async function requireProjectAdmin(projectId, userId) {
  const member = await requireProjectMember(projectId, userId);
  if (!member.ok) return member;
  if (!hasMinimumProjectRole(member.access.role, 'admin')) {
    return { ok: false, status: 403, error: 'Admin or owner access required' };
  }
  return member;
}

function getSourceRootId(project) {
  return project.source_root_id ?? null;
}

/**
 * Paginated list of completed tracks in the project's source collab tree.
 */
export async function listProjectCollabTracks(projectId, userId, query = {}) {
  const member = await requireProjectMember(projectId, userId);
  if (!member.ok) return member;

  const sourceRootId = getSourceRootId(member.access.project);
  if (!sourceRootId) {
    return { ok: false, status: 400, error: 'This project was not created from a collab tree' };
  }

  const cursor = parseCursor(query.cursor);
  const limit = parseLimit(query.limit);

  const params = [sourceRootId];
  let cursorClause = '';
  if (cursor != null) {
    params.push(cursor);
    cursorClause = `AND t.id < $${params.length}`;
  }
  params.push(limit + 1);

  const result = await pool.query(
    `SELECT
       t.id,
       t.guid,
       t.title,
       t.duration,
       t.audio_url,
       t.waveform_url,
       t.layer,
       t.created_at,
       u.id AS user_id,
       u.username,
       u.profile_pic_url,
       u.verified
     FROM tracks t
     LEFT JOIN users u ON u.id = t.user_id
     WHERE t.root_id = $1
       AND t.processing_status = 'completed'
       AND t.audio_url IS NOT NULL
       ${cursorClause}
     ORDER BY t.id DESC
     LIMIT $${params.length}`,
    params
  );

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

  const tracks = rows.map((row) => ({
    trackId: row.id,
    guid: row.guid,
    title: row.title,
    durationSeconds: row.duration != null ? Number(row.duration) : null,
    audioUrl: toPublicTrackUrl(row.audio_url),
    waveformUrl: toPublicTrackUrl(row.waveform_url),
    layer: row.layer,
    createdAt: row.created_at,
    username: row.username,
    userId: row.user_id,
    profilePicUrl: row.profile_pic_url,
    verified: row.verified,
  }));

  const nextCursor = hasMore ? tracks[tracks.length - 1].trackId : null;

  return {
    ok: true,
    tracks,
    nextCursor,
    sourceRootId,
  };
}

/**
 * Distinct publishers in the source collab tree, excluding members and pending invitees.
 */
export async function listProjectCollabUsers(projectId, userId, query = {}) {
  const admin = await requireProjectAdmin(projectId, userId);
  if (!admin.ok) return admin;

  const sourceRootId = getSourceRootId(admin.access.project);
  if (!sourceRootId) {
    return { ok: false, status: 400, error: 'This project was not created from a collab tree' };
  }

  const cursor = typeof query.cursor === 'string' && query.cursor.length > 0
    ? query.cursor
    : null;
  const limit = parseLimit(query.limit);

  const params = [sourceRootId, projectId];
  let cursorClause = '';
  if (cursor) {
    params.push(cursor);
    cursorClause = `AND u.id > $${params.length}`;
  }
  params.push(limit + 1);

  const result = await pool.query(
    `SELECT DISTINCT ON (u.id)
       u.id,
       u.username,
       u.name,
       u.profile_pic_url,
       u.verified
     FROM tracks t
     JOIN users u ON u.id = t.user_id
     WHERE t.root_id = $1
       AND t.processing_status = 'completed'
       AND NOT EXISTS (
         SELECT 1 FROM project_members pm
         WHERE pm.project_id = $2 AND pm.user_id = u.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM project_invites pi
         WHERE pi.project_id = $2
           AND pi.invited_user_id = u.id
           AND pi.revoked_at IS NULL
           AND pi.accepted_at IS NULL
           AND pi.expires_at > CURRENT_TIMESTAMP
       )
       ${cursorClause}
     ORDER BY u.id ASC
     LIMIT $${params.length}`,
    params
  );

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

  const users = rows.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    profile_pic_url: row.profile_pic_url,
    verified: row.verified,
  }));

  const nextCursor = hasMore ? users[users.length - 1].id : null;

  return {
    ok: true,
    users,
    nextCursor,
    sourceRootId,
  };
}

/**
 * Copy (or reuse) a collab-tree track stem into the project asset library.
 */
export async function createProjectCollabAsset(projectId, userId, trackIdOrGuid) {
  const editor = await requireProjectEditor(projectId, userId);
  if (!editor.ok) return editor;

  const sourceRootId = getSourceRootId(editor.access.project);
  if (!sourceRootId) {
    return { ok: false, status: 400, error: 'This project was not created from a collab tree' };
  }

  if (trackIdOrGuid == null || trackIdOrGuid === '') {
    return { ok: false, status: 400, error: 'track_id is required' };
  }

  // Ensure the track belongs to this project's source tree.
  const trackCheck = await pool.query(
    `SELECT id, root_id, processing_status
     FROM tracks
     WHERE ${typeof trackIdOrGuid === 'string' && trackIdOrGuid.includes('-') ? 'guid = $1' : 'id = $1'}`,
    [trackIdOrGuid]
  );
  if (trackCheck.rows.length === 0) {
    return { ok: false, status: 404, error: 'Track not found' };
  }
  const track = trackCheck.rows[0];
  if (track.root_id !== sourceRootId) {
    return { ok: false, status: 400, error: 'Track is not part of this project\'s collab tree' };
  }

  const copyResult = await copySingleTrackAsset(
    editor.access.project,
    track.id,
    userId
  );

  if (!copyResult.ok) {
    return copyResult;
  }

  return {
    ok: true,
    asset: copyResult.asset,
    created: copyResult.created,
  };
}
