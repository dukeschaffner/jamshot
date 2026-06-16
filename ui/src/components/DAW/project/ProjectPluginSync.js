'use client';

import { useProjectEditor } from './ProjectEditorContext';
import { usePluginWebSocket } from '../../../contexts/PluginWebSocketContext';
import { projectApi } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';
import {
  buildProjectSyncMessage,
  buildSetProjectMessage,
} from './projectPluginSyncMessages';
import styles from '../DAW.module.css';

async function fetchPluginPayload(projectGuid) {
  const response = await projectApi.getProjectPluginPayload(projectGuid);
  return response.data;
}

export default function ProjectPluginSync({ setShowMenu }) {
  const { send } = usePluginWebSocket();
  const { isActive, canEdit, projectData } = useProjectEditor();
  const { showToast } = useToast();

  const handlePluginError = (err, fallbackMessage) => {
    const message = err.response?.data?.error || fallbackMessage;
    showToast({ message, variant: 'error' });
  };

  const openInPlugin = async () => {
    if (!isActive || !canEdit || !projectData?.guid) return;

    try {
      const payload = await fetchPluginPayload(projectData.guid);
      const msg = buildSetProjectMessage(projectData.guid, projectData.name, payload);
      await send(JSON.stringify(msg));
    } catch (err) {
      handlePluginError(err, 'Failed to load project for plugin. Please try again.');
    }

    setShowMenu?.(false);
  };

  const syncToPlugin = async () => {
    if (!isActive || !canEdit || !projectData?.guid) return;

    try {
      const payload = await fetchPluginPayload(projectData.guid);
      const msg = buildProjectSyncMessage(projectData.guid, payload);
      await send(JSON.stringify(msg));
    } catch (err) {
      handlePluginError(err, 'Failed to sync project to plugin. Please try again.');
    }

    setShowMenu?.(false);
  };

  if (!isActive || !canEdit) {
    return null;
  }

  return (
    <>
      <button type="button" className={styles.menuItem} onClick={openInPlugin}>
        Open in Plugin
      </button>
      <button type="button" className={styles.menuItem} onClick={syncToPlugin}>
        Sync to Plugin
      </button>
    </>
  );
}
