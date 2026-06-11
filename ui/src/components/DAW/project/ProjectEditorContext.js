'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { projectApi } from '@/lib/api';
import { MAX_PROJECT_TRACKS } from '@sterio/subscription-utils';
import { useToast } from '@/lib/ToastContext';
import { useDAW } from '../DAWContext';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import { bufferRegistry } from '../core/BufferRegistry';
import AudioState from '../core/AudioStateStore';
import { getAudioBufferFromS3 } from '../misc/DAWUtils';
import { hasProjectEditorRole } from './projectEditorConstants';
import {
  audioBufferToWavBlob,
  buildClipUploadFormData,
  CLIP_PROCESSING_STATUS,
  isClipInFlight,
  isFailedClipStatus,
  mapServerProcessingStatus,
  pollProjectAssetStatus,
  sanitizeProjectProcessingError,
} from './projectClipUpload';

const ProjectEditorContext = createContext(null);

const INACTIVE_PROJECT_EDITOR = {
  isActive: false,
  projectData: null,
  canEdit: false,
  isAtTrackLimit: false,
  isTrackMutationPending: false,
  armedTrackId: null,
  setArmedTrackId: () => {},
  hasInFlightClipWork: false,
  addProjectTrack: async () => {},
  deleteProjectTrack: async () => {},
  applyProjectServerState: () => {},
  retryClipUpload: async () => {},
  deleteFailedClip: async () => {},
  startProjectRecording: () => {},
};

function updateRegionMeta(track, region, patch) {
  Object.assign(region, patch);
  eventBus.emit(DAW_EVENTS.REGION.UPDATE, { region, trackId: track.id });
}

export function ProjectEditorProvider({ projectData, onProjectStateChange, children }) {
  const { showToast } = useToast();
  const { trackManagerRef, tracks, syncTracksFromManager } = useDAW();

  const [armedTrackId, setArmedTrackIdState] = useState(null);
  const [isTrackMutationPending, setIsTrackMutationPending] = useState(false);
  const [inFlightClipCount, setInFlightClipCount] = useState(0);

  const projectDataRef = useRef(projectData);
  const armedTrackIdRef = useRef(armedTrackId);
  const inFlightRegionIdsRef = useRef(new Set());
  useEffect(() => {
    projectDataRef.current = projectData;
  }, [projectData]);

  useEffect(() => {
    armedTrackIdRef.current = armedTrackId;
    AudioState.armedTrackId = armedTrackId;

    if (!trackManagerRef.current) return;
    trackManagerRef.current.getAllTracks().forEach((track) => {
      const isArmed = track.id === armedTrackId;
      track.isArmed = isArmed;
      if (isArmed) {
        track.enableRecordingTrackRouting?.();
      } else {
        track.disableRecordingTrackRouting?.();
      }
    });
    eventBus.emit(DAW_EVENTS.AUDIO_SETTINGS.ARMED_TRACK_CHANGE, {
      trackId: armedTrackId,
    });
  }, [armedTrackId, trackManagerRef, tracks]);

  const canEdit = hasProjectEditorRole(projectData?.role);
  const isAtTrackLimit = tracks.length >= MAX_PROJECT_TRACKS;
  const hasInFlightClipWork = inFlightClipCount > 0;

  const setArmedTrackId = useCallback((trackId) => {
    setArmedTrackIdState(trackId);
  }, []);

  const bumpInFlight = useCallback((delta) => {
    setInFlightClipCount((count) => Math.max(0, count + delta));
  }, []);

  const applyProjectServerState = useCallback(
    (nextState) => {
      if (!trackManagerRef.current) return;
      trackManagerRef.current.applyProjectState(nextState);
      const nextTracks = syncTracksFromManager();
      setArmedTrackIdState((current) =>
        current != null && !nextTracks.some((track) => track.id === current)
          ? (nextTracks[0]?.id ?? null)
          : current
      );
      onProjectStateChange?.(nextState);
    },
    [onProjectStateChange, syncTracksFromManager, trackManagerRef]
  );

  const markRegionSyncFailed = useCallback((track, region, errorMessage) => {
    updateRegionMeta(track, region, {
      processingStatus: CLIP_PROCESSING_STATUS.FAILED,
      processingError: sanitizeProjectProcessingError(errorMessage),
    });
  }, []);

  const swapRegionToServerAudio = useCallback(
    async (track, region, audioUrl) => {
      const audioContext = trackManagerRef.current?.audioContext;
      if (!audioContext || !audioUrl) {
        return false;
      }

      const serverBuffer = await getAudioBufferFromS3(audioUrl, audioContext);
      const oldKey = region.key;
      const newKey = bufferRegistry.generateBufferKey(
        track.id,
        `clip-${region.projectClipId}`
      );
      bufferRegistry.storeBuffer(newKey, serverBuffer, {
        name: `clip-${region.projectClipId}`,
        trackId: track.id,
        clipId: region.projectClipId,
      });

      region.key = newKey;
      if (oldKey && bufferRegistry.hasBuffer(oldKey)) {
        bufferRegistry.removeBuffer(oldKey);
      }

      updateRegionMeta(track, region, {
        processingStatus: CLIP_PROCESSING_STATUS.COMPLETED,
        processingError: null,
      });
      return true;
    },
    [trackManagerRef]
  );

  const uploadClipFromBuffer = useCallback(
    async ({ track, region, bufferKey, clipId = null }) => {
      const currentProject = projectDataRef.current;
      if (!currentProject?.guid || currentProject.revision == null) return;

      const buffer = bufferRegistry.getBuffer(bufferKey);
      if (!buffer) return;

      if (inFlightRegionIdsRef.current.has(region.id)) return;

      inFlightRegionIdsRef.current.add(region.id);
      bumpInFlight(1);
      updateRegionMeta(track, region, {
        processingStatus: CLIP_PROCESSING_STATUS.UPLOADING,
        processingError: null,
      });

      try {
        const wavBlob = audioBufferToWavBlob(buffer);
        const trimStart = region.offset ?? 0;
        const trimEnd = region.endTime - region.startTime + trimStart;
        const formData = buildClipUploadFormData({
          file: wavBlob,
          revision: currentProject.revision,
          startTimeSeconds: region.startTime,
          trimStartSeconds: trimStart,
          trimEndSeconds: trimEnd,
          clipId,
        });

        const response = await projectApi.uploadProjectClip(
          currentProject.guid,
          track.id,
          formData
        );

        const { assetId, clipId: serverClipId, revision } = response.data;
        onProjectStateChange?.({
          ...currentProject,
          revision,
        });

        updateRegionMeta(track, region, {
          projectClipId: serverClipId,
          projectAssetId: assetId,
          processingStatus: CLIP_PROCESSING_STATUS.PENDING,
        });

        const pollResult = await pollProjectAssetStatus({
          projectApi,
          projectGuid: currentProject.guid,
          assetId,
          onStatus: (status) => {
            const mappedStatus = mapServerProcessingStatus(status);
            if (mappedStatus) {
              updateRegionMeta(track, region, {
                processingStatus: mappedStatus,
              });
            }
          },
        });

        if (pollResult.status === 'completed') {
          const projectResponse = await projectApi.getProject(currentProject.guid);
          const projectState = projectResponse.data;
          onProjectStateChange?.(projectState);

          let audioUrl = null;
          for (const trackData of projectState.tracks || []) {
            const clip = (trackData.clips || []).find(
              (item) => item.id === serverClipId
            );
            if (clip?.audioUrl) {
              audioUrl = clip.audioUrl;
              break;
            }
          }

          const swapped = await swapRegionToServerAudio(track, region, audioUrl);
          if (!swapped) {
            markRegionSyncFailed(track, region, pollResult.error);
          }
        } else {
          markRegionSyncFailed(
            track,
            region,
            pollResult.error || sanitizeProjectProcessingError()
          );
        }
      } catch (err) {
        const message =
          err.response?.data?.error ||
          err.message ||
          'Failed to upload recording. Please try again.';

        if (region.projectClipId) {
          markRegionSyncFailed(track, region, message);
        } else {
          updateRegionMeta(track, region, {
            processingStatus: CLIP_PROCESSING_STATUS.UPLOAD_FAILED,
            processingError: message,
          });
        }

        if (!clipId) {
          showToast({ message, variant: 'error' });
        }
      } finally {
        inFlightRegionIdsRef.current.delete(region.id);
        bumpInFlight(-1);
      }
    },
    [
      bumpInFlight,
      markRegionSyncFailed,
      onProjectStateChange,
      showToast,
      swapRegionToServerAudio,
    ]
  );

  const handleProjectRecordingStopped = useCallback(
    async (data) => {
      const trackId = armedTrackIdRef.current;
      if (!trackId || !trackManagerRef.current) return;

      const track = trackManagerRef.current.getTrack(trackId);
      if (!track || !data?.bufferKey) return;

      const buffer = bufferRegistry.getBuffer(data.bufferKey);
      if (!buffer || buffer.duration <= 0) {
        showToast({
          message: 'Recording was too short. Please try again.',
          variant: 'error',
        });
        bufferRegistry.removeBuffer(data.bufferKey);
        return;
      }

      const endTime = data.startTime + buffer.duration - (data.offset ?? 0);
      const projectDuration =
        projectDataRef.current?.durationSeconds ?? AudioState.dawDuration;
      if (endTime > projectDuration) {
        showToast({
          message: `Recording extends beyond project duration (${projectDuration}s).`,
          variant: 'error',
        });
        bufferRegistry.removeBuffer(data.bufferKey);
        return;
      }

      const region = track.addRegion(
        data.bufferKey,
        data.startTime,
        data.offset,
        endTime,
        track.title || 'Recording',
        false,
        false,
        data.latencyData
      );

      if (!region) return;

      updateRegionMeta(track, region, {
        processingStatus: CLIP_PROCESSING_STATUS.UPLOADING,
        projectClipId: null,
        projectAssetId: null,
        processingError: null,
      });

      await uploadClipFromBuffer({
        track,
        region,
        bufferKey: data.bufferKey,
      });
    },
    [showToast, trackManagerRef, uploadClipFromBuffer]
  );

  const startProjectRecording = useCallback(() => {
    if (!canEdit) return false;
    if (armedTrackIdRef.current == null) {
      showToast({
        message: 'Arm a track before recording.',
        variant: 'error',
      });
      return false;
    }
    AudioState.recordingTargetTrackId = armedTrackIdRef.current;
    eventBus.emit(DAW_EVENTS.RECORDING.START);
    return true;
  }, [canEdit, showToast]);

  const retryClipUpload = useCallback(
    async (regionId, trackId) => {
      if (!trackManagerRef.current) return;
      const track = trackManagerRef.current.getTrack(trackId);
      if (!track) return;

      const region = track.regions.find((item) => item.id === regionId);
      if (!region?.key) return;
      if (isClipInFlight(region.processingStatus)) return;
      if (!isFailedClipStatus(region.processingStatus)) return;

      await uploadClipFromBuffer({
        track,
        region,
        bufferKey: region.key,
        clipId: region.projectClipId ?? null,
      });
    },
    [trackManagerRef, uploadClipFromBuffer]
  );

  const deleteFailedClip = useCallback(
    async (regionId, trackId) => {
      const currentProject = projectDataRef.current;
      if (!currentProject?.guid || currentProject.revision == null) return;
      if (!trackManagerRef.current) return;

      const track = trackManagerRef.current.getTrack(trackId);
      if (!track) return;

      const region = track.regions.find((item) => item.id === regionId);
      if (!region) return;

      if (region.projectClipId) {
        try {
          const response = await projectApi.deleteProjectClip(
            currentProject.guid,
            region.projectClipId,
            { revision: currentProject.revision }
          );
          applyProjectServerState(response.data);
        } catch (err) {
          const message =
            err.response?.data?.error ||
            'Failed to delete clip. Please try again.';
          showToast({ message, variant: 'error' });
          return;
        }
      }

      if (region.key && bufferRegistry.hasBuffer(region.key)) {
        bufferRegistry.removeBuffer(region.key);
      }

      eventBus.emit(DAW_EVENTS.REGION.REMOVE, {
        region,
        trackId: track.id,
        recordUndo: false,
      });
    },
    [applyProjectServerState, showToast, trackManagerRef]
  );

  useEffect(() => {
    if (!canEdit || armedTrackId != null || tracks.length === 0) return;
    setArmedTrackIdState(tracks[0].id);
  }, [canEdit, armedTrackId, tracks]);

  useEffect(() => {
    const handleRecordingStopped = (data) => {
      handleProjectRecordingStopped(data);
    };

    eventBus.on(DAW_EVENTS.RECORDING.STOPPED, handleRecordingStopped);
    return () => {
      eventBus.off(DAW_EVENTS.RECORDING.STOPPED, handleRecordingStopped);
    };
  }, [handleProjectRecordingStopped]);

  const addProjectTrack = useCallback(async () => {
    if (!canEdit || isTrackMutationPending || tracks.length >= MAX_PROJECT_TRACKS) {
      return;
    }
    if (!projectData?.guid || projectData.revision == null) return;

    setIsTrackMutationPending(true);
    try {
      const response = await projectApi.createProjectTrack(projectData.guid, {
        revision: projectData.revision,
      });
      applyProjectServerState(response.data);
    } catch (err) {
      const message =
        err.response?.data?.error || 'Failed to add track. Please try again.';
      showToast({ message, variant: 'error' });
    } finally {
      setIsTrackMutationPending(false);
    }
  }, [
    applyProjectServerState,
    canEdit,
    isTrackMutationPending,
    projectData,
    showToast,
    tracks.length,
  ]);

  const deleteProjectTrack = useCallback(
    async (trackId) => {
      if (!canEdit || isTrackMutationPending) return;
      if (!projectData?.guid || projectData.revision == null) return;

      setIsTrackMutationPending(true);
      try {
        const response = await projectApi.deleteProjectTrack(
          projectData.guid,
          trackId,
          { revision: projectData.revision }
        );
        applyProjectServerState(response.data);
      } catch (err) {
        const message =
          err.response?.data?.error || 'Failed to delete track. Please try again.';
        showToast({ message, variant: 'error' });
      } finally {
        setIsTrackMutationPending(false);
      }
    },
    [
      applyProjectServerState,
      canEdit,
      isTrackMutationPending,
      projectData,
      showToast,
    ]
  );

  const value = useMemo(
    () => ({
      isActive: true,
      projectData,
      canEdit,
      isAtTrackLimit,
      isTrackMutationPending,
      armedTrackId,
      setArmedTrackId,
      hasInFlightClipWork,
      addProjectTrack,
      deleteProjectTrack,
      applyProjectServerState,
      retryClipUpload,
      deleteFailedClip,
      startProjectRecording,
      isClipInFlight,
    }),
    [
      projectData,
      canEdit,
      isAtTrackLimit,
      isTrackMutationPending,
      armedTrackId,
      setArmedTrackId,
      hasInFlightClipWork,
      addProjectTrack,
      deleteProjectTrack,
      applyProjectServerState,
      retryClipUpload,
      deleteFailedClip,
      startProjectRecording,
    ]
  );

  return (
    <ProjectEditorContext.Provider value={value}>
      {children}
    </ProjectEditorContext.Provider>
  );
}

export function useProjectEditor() {
  return useContext(ProjectEditorContext) ?? INACTIVE_PROJECT_EDITOR;
}
