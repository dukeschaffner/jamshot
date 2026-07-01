export const PROJECT_ASSET_DRAG_MIME = 'application/x-jamshot-project-asset';

export function buildProjectAssetDragPayload(asset) {
  return JSON.stringify({
    assetId: asset.id,
    durationSeconds: asset.durationSeconds,
    name: asset.name,
  });
}

export function parseProjectAssetDragPayload(raw) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const assetId = Number(parsed.assetId);
    const durationSeconds =
      parsed.durationSeconds != null ? Number(parsed.durationSeconds) : null;

    if (!Number.isFinite(assetId)) return null;

    return {
      assetId,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
      name: parsed.name || 'Audio',
    };
  } catch {
    return null;
  }
}

export function getProjectAssetFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return null;

  const raw = dataTransfer.getData(PROJECT_ASSET_DRAG_MIME);
  return parseProjectAssetDragPayload(raw);
}

export function setProjectAssetDragData(dataTransfer, asset) {
  if (!dataTransfer || !asset) return;

  dataTransfer.setData(PROJECT_ASSET_DRAG_MIME, buildProjectAssetDragPayload(asset));
  dataTransfer.effectAllowed = 'copy';
}
