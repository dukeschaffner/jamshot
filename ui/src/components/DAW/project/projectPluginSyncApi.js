import { projectApi } from '@/lib/api';

export async function fetchProjectPluginPayload(projectGuid) {
  const response = await projectApi.getProjectPluginPayload(projectGuid);
  return response.data;
}
