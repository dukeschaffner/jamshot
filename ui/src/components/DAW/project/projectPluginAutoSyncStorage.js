import { PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY } from './ProjectsConfig';
import {
  readPluginAutoSyncEnabled,
  writePluginAutoSyncEnabled,
} from '@/components/DAW/pluginSync/pluginAutoSyncStorage';

export function readProjectPluginAutoSyncEnabled() {
  return readPluginAutoSyncEnabled(PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY);
}

export function writeProjectPluginAutoSyncEnabled(enabled) {
  writePluginAutoSyncEnabled(PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY, enabled);
}
