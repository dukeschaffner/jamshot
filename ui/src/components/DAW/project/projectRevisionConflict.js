/**
 * Revision conflict helpers for project REST mutations (Step 21).
 */

export function getRevisionConflictInfo(error) {
  if (error?.response?.status !== 409) return null;

  const data = error?.response?.data;
  if (!data || data.error !== 'REVISION_MISMATCH') return null;

  return {
    currentRevision: data.current_revision ?? null,
    yourRevision: data.your_revision ?? null,
  };
}

export function isRevisionConflict(error) {
  return getRevisionConflictInfo(error) != null;
}
