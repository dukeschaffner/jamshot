'use client';

import { useProjectEditor } from '../project/ProjectEditorContext';
import { usePluginWebSocket } from '../../../contexts/PluginWebSocketContext';
import { projectApi } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';
import styles from '../DAW.module.css';

export default function ProjectPluginSync({ setShowMenu }) {
  const { send } = usePluginWebSocket();
  const { isActive, canEdit, projectData } = useProjectEditor();
  const { showToast } = useToast();

  const openInPlugin = async () => {
    if (!isActive || !canEdit || !projectData?.guid) return;

    try {
      const response = await projectApi.getProjectPluginPayload(projectData.guid);
      const msg = {
        type: 'set_project',
        project_id: projectData.guid,
        name: projectData.name,
        payload: {
          ...response.data,
          name: response.data?.name ?? projectData.name,
        },
      };
      await send(JSON.stringify(msg));
    } catch (err) {
      const message =
        err.response?.data?.error || 'Failed to load project for plugin. Please try again.';
      showToast({ message, variant: 'error' });
    }

    setShowMenu?.(false);
  };

  if (!isActive || !canEdit) {
    return null;
  }

  return (
    <button type="button" className={styles.menuItem} onClick={openInPlugin}>
      Open in Plugin
    </button>
  );
}
