export const PROJECT_EDITOR_ROLES = new Set(['owner', 'admin', 'editor']);

export function hasProjectEditorRole(role) {
  return PROJECT_EDITOR_ROLES.has(role);
}
