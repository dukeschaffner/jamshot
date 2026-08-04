/**
 * Counts tracks that appear in the project editor / GET response.
 * Tracks that only have soft-deleted clips are retained for snapshot restore
 * but must not consume the project track limit (same visibility rule as
 * fetchProjectTimelineRows in projectUtils.js).
 */
export async function countActiveProjectTracks(executor, projectId) {
  const result = await executor.query(
    `SELECT COUNT(*)::int AS count
     FROM project_tracks pt
     WHERE pt.project_id = $1
       AND (
         NOT EXISTS (
           SELECT 1 FROM project_clips pc_hist
           WHERE pc_hist.project_track_id = pt.id
         )
         OR EXISTS (
           SELECT 1 FROM project_clips pc_active
           WHERE pc_active.project_track_id = pt.id
             AND pc_active.deleted_at IS NULL
         )
       )`,
    [projectId]
  );
  return result.rows[0].count;
}
