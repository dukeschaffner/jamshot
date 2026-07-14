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
import { useUser } from '@/contexts/UserContext';
import { useDAW } from '../DAWContext';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import AudioState from '../core/AudioStateStore';
import { getProjectAssetAudioBuffer } from './getProjectAssetAudioBuffer';
import { deleteCachedProjectAsset } from './projectAssetAudioCache';
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
import {
  decodeAudioFile,
  getProjectMaxImportDuration,
  validateClipPlacement,
  buildClipPatchPayload,
} from './projectClipPlacement';
import {
  buildPlaceClipFromTrimsPayload,
  canCopyProjectRegion,
  computeClipboardPlacement,
  computeSplitClipboardSpecs,
  getClipboardAssetId,
  getRegionClipboardTrims,
  isProjectClipboardPasteable,
} from './projectRegionClipboard';
import { buildClipOpPayload } from './projectWsOpPayloads';
import { useProjectPersistence } from '@/hooks/useProjectPersistence';
import { useProjectPluginAutoSync } from '@/hooks/useProjectPluginAutoSync';
import { applyProjectTransportSettings, emitProjectTrackMixerState } from './projectLoader';
import {
  getRevisionConflictInfo,
  isRevisionConflict,
} from './projectRevisionConflict';
import ProjectRevisionConflictDialog from './ProjectRevisionConflictDialog';
import { fetchProjectPluginPayload } from './projectPluginSyncApi';
import { buildSetProjectMessage } from './projectPluginSyncMessages';
import { usePluginWebSocket } from '@/contexts/PluginWebSocketContext';
import { useProjectSync } from './ProjectSyncContext';
import {
  applyRemoteProjectOp,
  shouldApplyRemoteOp,
} from './projectRemoteOpApplier';
import { syncProjectClipsFromState } from './projectClipSync';
import {
  applyProjectWsOpAck,
  mergeProjectStateAfterOp,
} from './projectWsOpAck';
import { ProjectRemoteOpQueue } from './projectRemoteOpQueue';
import { bufferRegistry } from '../core/BufferRegistry';
import {
  buildClipDeleteOpPayload,
  removeProjectRegionLocally,
} from './projectClipDelete';
import {
  buildTrackReorderOrders,
  validateProjectTrackName,
} from './projectTrackMutations';

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
  renameProjectTrack: async () => {},
  reorderProjectTracks: async () => {},
  applyProjectServerState: () => {},
  retryClipUpload: async () => {},
  deleteFailedClip: async () => {},
  deleteProjectRegion: async () => {},
  startProjectRecording: () => {},
  importAudioFileToTrack: async () => {},
  placeLibraryAssetOnTrack: async () => false,
  pasteProjectRegion: async () => false,
  repeatProjectRegion: async () => false,
  splitProjectRegion: async () => false,
  deleteProjectAsset: async () => ({ ok: false }),
  persistClipLayout: () => {},
  moveProjectRegion: () => false,
  crossTrackDragPreview: null,
  setCrossTrackDragPreview: () => {},
  clearCrossTrackDragPreview: () => {},
  pluginAutoSyncEnabled: true,
  setPluginAutoSyncEnabled: () => {},
  isPluginStale: false,
  syncProjectToPlugin: async () => {},
  openProjectInPlugin: async () => {},
};

function updateRegionMeta(track, region, patch) {
  Object.assign(region, patch);
  eventBus.emit(DAW_EVENTS.REGION.UPDATE, { region, trackId: track.id });
}

export function ProjectEditorProvider({ projectData, onProjectStateChange, children }) {
  const { showToast } = useToast();
  const { user } = useUser();
  const { send: sendPluginMessage } = usePluginWebSocket();
  const {
    sendProjectOp,
    isWsConnected,
    acquireMetadataLock,
    releaseMetadataLock,
    acquireTrackLock,
    releaseTrackLock,
  } = useProjectSync();
  const { trackManagerRef, tracks, syncTracksFromManager, clipboard, selectedRegionId, selectedTrackId, playheadLocation, selectRegion } = useDAW();

  const [armedTrackId, setArmedTrackIdState] = useState(null);
  const [isTrackMutationPending, setIsTrackMutationPending] = useState(false);
  const [inFlightClipCount, setInFlightClipCount] = useState(0);
  const [crossTrackDragPreview, setCrossTrackDragPreviewState] = useState(null);
  const [revisionConflictPrompt, setRevisionConflictPrompt] = useState(null);

  const projectDataRef = useRef(projectData);
  const armedTrackIdRef = useRef(armedTrackId);
  const inFlightRegionIdsRef = useRef(new Set());
  const suppressSettingsPersistRef = useRef(false);
  const remoteOpQueueRef = useRef(null);
  const clipSyncGenerationRef = useRef(0);
  if (!remoteOpQueueRef.current) {
    remoteOpQueueRef.current = new ProjectRemoteOpQueue();
  }
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

  const setCrossTrackDragPreview = useCallback((preview) => {
    setCrossTrackDragPreviewState(preview);
  }, []);

  const clearCrossTrackDragPreview = useCallback(() => {
    setCrossTrackDragPreviewState(null);
  }, []);

  const applyProjectServerState = useCallback(
    (nextState) => {
      if (!trackManagerRef.current) return;

      const prevTrackCount = trackManagerRef.current.getAllTracks().length;
      suppressSettingsPersistRef.current = true;
      try {
        trackManagerRef.current.applyProjectState(nextState);
        applyProjectTransportSettings(nextState);
        const nextTracks = syncTracksFromManager();
        if (trackManagerRef.current.getAllTracks().length > prevTrackCount) {
          emitProjectTrackMixerState(trackManagerRef.current);
        }
        setArmedTrackIdState((current) =>
          current != null && !nextTracks.some((track) => track.id === current)
            ? (nextTracks[0]?.id ?? null)
            : current
        );
        projectDataRef.current = nextState;
        onProjectStateChange?.(nextState);
      } finally {
        suppressSettingsPersistRef.current = false;
      }

      const generation = ++clipSyncGenerationRef.current;
      void syncProjectClipsFromState(trackManagerRef.current, nextState).then(() => {
        if (generation !== clipSyncGenerationRef.current) return;
        syncTracksFromManager();
      });
    },
    [onProjectStateChange, syncTracksFromManager, trackManagerRef]
  );

  const applyLocalWsOpResult = useCallback(
    (result) => {
      applyProjectWsOpAck({
        trackManager: trackManagerRef.current,
        opPayload: result.payload,
        revision: result.revision,
        currentProjectState: projectDataRef.current,
        projectDataRef,
        remoteOpQueue: remoteOpQueueRef.current,
        syncTracksFromManager,
        onProjectStateChange,
        setArmedTrackId: setArmedTrackIdState,
        suppressSettingsPersistRef,
      });
    },
    [onProjectStateChange, syncTracksFromManager, trackManagerRef]
  );

  const onConflictPrompt = useCallback(({ onReload, onDiscard }) => {
    setRevisionConflictPrompt({ onReload, onDiscard });
  }, []);

  const onRevisionOnlyUpdate = useCallback(
    (nextRevision) => {
      const current = projectDataRef.current;
      if (!current || nextRevision == null) return;
      onProjectStateChange?.({ ...current, revision: nextRevision });
    },
    [onProjectStateChange]
  );

  const {
    autoSyncEnabled: pluginAutoSyncEnabled,
    setAutoSyncEnabled: setPluginAutoSyncEnabled,
    isPluginStale,
    clearPluginStale,
    notifyProjectMutated,
    syncToPluginNow,
  } = useProjectPluginAutoSync({
    projectGuid: projectData?.guid,
    canEdit,
  });

  const { scheduleClipPersist, scheduleProjectSettingsPersist, handleRevisionConflict, clearPendingEdits, clearPendingClipEdit } =
    useProjectPersistence({
      projectGuid: projectData?.guid,
      revision: projectData?.revision,
      applyProjectServerState,
      onRevisionOnlyUpdate,
      showToast,
      onConflictPrompt,
      onRestSaveSuccess: notifyProjectMutated,
      sendProjectOp,
      isWsConnected,
      acquireMetadataLock,
      releaseMetadataLock,
    });

  const resolveRevisionConflictReload = useCallback(async () => {
    const prompt = revisionConflictPrompt;
    setRevisionConflictPrompt(null);
    await prompt?.onReload?.();
  }, [revisionConflictPrompt]);

  const resolveRevisionConflictDiscard = useCallback(() => {
    const prompt = revisionConflictPrompt;
    setRevisionConflictPrompt(null);
    prompt?.onDiscard?.();
  }, [revisionConflictPrompt]);

  const openProjectInPlugin = useCallback(async () => {
    const current = projectDataRef.current;
    if (!current?.guid || !canEdit) return false;

    try {
      const payload = await fetchProjectPluginPayload(current.guid);
      const message = buildSetProjectMessage(current.guid, current.name, payload);
      const sent = await sendPluginMessage(JSON.stringify(message));
      if (sent) {
        clearPluginStale();
      }
      return sent;
    } catch (err) {
      const message =
        err.response?.data?.error || 'Failed to load project for plugin. Please try again.';
      showToast({ message, variant: 'error' });
      return false;
    }
  }, [canEdit, clearPluginStale, sendPluginMessage, showToast]);

  const syncProjectToPlugin = useCallback(async () => {
    return syncToPluginNow({ silentSuccess: false });
  }, [syncToPluginNow]);

  const moveProjectRegion = useCallback(
    (fromTrackId, toTrackId, regionId, updatedRegion) => {
      if (!trackManagerRef.current) return false;
      return trackManagerRef.current.moveRegionBetweenTracks(
        fromTrackId,
        toTrackId,
        regionId,
        updatedRegion
      );
    },
    [trackManagerRef]
  );

  const persistClipLayout = useCallback(
    ({ clipId, region, trackId, previousState }) => {
      if (!clipId) return;

      const payload = buildClipPatchPayload(
        region,
        trackId,
        previousState.trackId
      );

      scheduleClipPersist({
        clipId,
        payload,
        trackId,
        sourceTrackId: previousState.trackId,
        revertState: () => {
          moveProjectRegion(
            trackId,
            previousState.trackId,
            region.id,
            {
              startTime: previousState.startTime,
              endTime: previousState.endTime,
              offset: previousState.offset,
            }
          );
        },
      });
    },
    [moveProjectRegion, scheduleClipPersist]
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

      const currentProject = projectDataRef.current;
      const serverBuffer = await getProjectAssetAudioBuffer(
        {
          projectGuid: currentProject?.guid ?? null,
          assetId: region.projectAssetId,
          audioUrl,
        },
        audioContext
      );
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
    async ({ track, region, bufferKey, clipId = null, uploadFile = null }) => {
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
        const fileBlob = uploadFile ?? audioBufferToWavBlob(buffer);
        const fileName = uploadFile?.name ?? 'recording.wav';
        const trimStart = region.offset ?? 0;
        const trimEnd = region.endTime - region.startTime + trimStart;
        const formData = buildClipUploadFormData({
          file: fileBlob,
          fileName,
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
          } else {
            notifyProjectMutated();
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
      notifyProjectMutated,
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
        data.latencyData,
        true
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

  const importAudioFileToTrack = useCallback(
    async (trackId, file, startTimeSeconds) => {
      if (!canEdit) return false;
      if (!file?.type?.startsWith('audio/')) {
        showToast({ message: 'Please select an audio file.', variant: 'error' });
        return false;
      }

      const currentProject = projectDataRef.current;
      if (!currentProject?.guid || currentProject.revision == null) return false;
      if (!trackManagerRef.current) return false;

      const track = trackManagerRef.current.getTrack(trackId);
      if (!track) return false;

      const audioContext = trackManagerRef.current.audioContext;
      if (!audioContext) return false;

      let audioBuffer;
      try {
        audioBuffer = await decodeAudioFile(file, audioContext);
      } catch {
        showToast({
          message: 'Could not read audio file. Please try a different format.',
          variant: 'error',
        });
        return false;
      }

      const maxDuration = getProjectMaxImportDuration();
      if (audioBuffer.duration > maxDuration) {
        const minutes = Math.floor(maxDuration / 60);
        showToast({
          message: `File is too long. Please select a file shorter than ${minutes} minutes.`,
          variant: 'error',
        });
        return false;
      }

      const projectDuration =
        currentProject.durationSeconds ?? AudioState.dawDuration;
      const placement = validateClipPlacement({
        track,
        startTime: startTimeSeconds ?? 0,
        fileDuration: audioBuffer.duration,
        projectDuration,
      });

      if (!placement.valid) {
        showToast({ message: placement.error, variant: 'error' });
        return false;
      }

      const bufferKey = bufferRegistry.generateBufferKey(trackId, file.name);
      bufferRegistry.storeBuffer(bufferKey, audioBuffer, {
        name: file.name,
        trackId,
      });

      const region = track.addRegion(
        bufferKey,
        placement.startTime,
        0,
        placement.endTime,
        file.name,
        false,
        false,
        null,
        true
      );

      if (!region) {
        bufferRegistry.removeBuffer(bufferKey);
        return false;
      }

      updateRegionMeta(track, region, {
        processingStatus: CLIP_PROCESSING_STATUS.UPLOADING,
        projectClipId: null,
        projectAssetId: null,
        processingError: null,
      });

      await uploadClipFromBuffer({
        track,
        region,
        bufferKey,
        uploadFile: file,
      });

      return true;
    },
    [canEdit, showToast, trackManagerRef, uploadClipFromBuffer]
  );

  const placeLibraryAssetOnTrack = useCallback(
    async (trackId, asset, startTimeSeconds) => {
      if (!canEdit) return false;

      const currentProject = projectDataRef.current;
      if (!currentProject?.guid || currentProject.revision == null) return false;
      if (!trackManagerRef.current) return false;
      if (!asset?.assetId) return false;

      const track = trackManagerRef.current.getTrack(trackId);
      if (!track) return false;

      const projectDuration =
        currentProject.durationSeconds ?? AudioState.dawDuration;
      const duration = asset.durationSeconds;
      if (duration == null || duration <= 0) {
        showToast({
          message: 'This file is not ready to place yet.',
          variant: 'error',
        });
        return false;
      }

      const placement = validateClipPlacement({
        track,
        startTime: startTimeSeconds ?? 0,
        fileDuration: duration,
        projectDuration,
      });

      if (!placement.valid) {
        showToast({ message: placement.error, variant: 'error' });
        return false;
      }

      try {
        const placementPayload = {
          revision: currentProject.revision,
          track_id: trackId,
          start_time_seconds: placement.startTime,
        };

        if (placement.clipDuration < duration) {
          placementPayload.trim_end_seconds = placement.clipDuration;
        }

        const response = await projectApi.placeProjectAssetClip(
          currentProject.guid,
          asset.assetId,
          placementPayload
        );
        applyProjectServerState(response.data);
        notifyProjectMutated();
        return true;
      } catch (err) {
        if (isRevisionConflict(err)) {
          await handleRevisionConflict({
            conflictInfo: getRevisionConflictInfo(err),
          });
          return false;
        }

        const message =
          err.response?.data?.error ||
          'Failed to place file on timeline. Please try again.';
        showToast({ message, variant: 'error' });
        return false;
      }
    },
    [
      applyProjectServerState,
      canEdit,
      handleRevisionConflict,
      notifyProjectMutated,
      showToast,
      trackManagerRef,
    ]
  );

  const placeAssetClipWithTrims = useCallback(
    async ({
      assetId,
      trackId,
      startTime,
      trimStart,
      trimEnd,
      excludeRegionId = null,
    }) => {
      if (!canEdit || assetId == null) return false;

      const currentProject = projectDataRef.current;
      if (!currentProject?.guid || currentProject.revision == null) return false;
      if (!trackManagerRef.current) return false;

      const track = trackManagerRef.current.getTrack(trackId);
      if (!track) return false;

      const projectDuration =
        currentProject.durationSeconds ?? AudioState.dawDuration;
      const regionDuration = trimEnd - trimStart;

      const placement = computeClipboardPlacement({
        track,
        startTime,
        regionDuration,
        projectDuration,
        excludeRegionId,
      });

      if (!placement.valid) {
        showToast({ message: placement.error, variant: 'error' });
        return false;
      }

      const effectiveTrimEnd = trimStart + placement.clipDuration;

      try {
        const response = await projectApi.placeProjectAssetClip(
          currentProject.guid,
          assetId,
          buildPlaceClipFromTrimsPayload({
            revision: currentProject.revision,
            trackId,
            startTime: placement.startTime,
            trimStart,
            trimEnd: effectiveTrimEnd,
          })
        );
        applyProjectServerState(response.data);
        notifyProjectMutated();
        return true;
      } catch (err) {
        if (isRevisionConflict(err)) {
          await handleRevisionConflict({
            conflictInfo: getRevisionConflictInfo(err),
          });
          return false;
        }

        const message =
          err.response?.data?.error ||
          'Failed to place clip on timeline. Please try again.';
        showToast({ message, variant: 'error' });
        return false;
      }
    },
    [
      applyProjectServerState,
      canEdit,
      handleRevisionConflict,
      notifyProjectMutated,
      showToast,
      trackManagerRef,
    ]
  );

  const pasteProjectRegion = useCallback(
    async (pasteTime = null, targetTrackId = null) => {
      if (!canEdit || !isProjectClipboardPasteable(clipboard)) {
        return false;
      }

      const assetId = getClipboardAssetId(clipboard);
      const trackId = targetTrackId ?? selectedTrackId;
      if (assetId == null || trackId == null) return false;

      const { trimStart, regionDuration } = getRegionClipboardTrims(clipboard.region);
      const startTime =
        pasteTime != null ? pasteTime : (playheadLocation?.time ?? 0);

      return placeAssetClipWithTrims({
        assetId,
        trackId,
        startTime,
        trimStart,
        trimEnd: trimStart + regionDuration,
      });
    },
    [
      canEdit,
      clipboard,
      placeAssetClipWithTrims,
      playheadLocation,
      selectedTrackId,
    ]
  );

  const repeatProjectRegion = useCallback(
    async (regionId = selectedRegionId, trackId = selectedTrackId) => {
      if (!canEdit || regionId == null || trackId == null) return false;
      if (!trackManagerRef.current) return false;

      const track = trackManagerRef.current.getTrack(trackId);
      if (!track) return false;

      const region = track.regions.find((item) => item.id === regionId);
      if (!region || !canCopyProjectRegion(region)) {
        showToast({
          message: 'This clip is not ready to repeat yet.',
          variant: 'error',
        });
        return false;
      }

      const { trimStart, regionDuration } = getRegionClipboardTrims(region);

      return placeAssetClipWithTrims({
        assetId: region.projectAssetId,
        trackId,
        startTime: region.endTime,
        trimStart,
        trimEnd: trimStart + regionDuration,
      });
    },
    [
      canEdit,
      placeAssetClipWithTrims,
      selectedRegionId,
      selectedTrackId,
      showToast,
      trackManagerRef,
    ]
  );

  const splitProjectRegion = useCallback(
    async (
      regionId = selectedRegionId,
      trackId = selectedTrackId,
      playheadTime = playheadLocation?.time
    ) => {
      if (!canEdit || regionId == null || trackId == null) return false;
      if (!trackManagerRef.current) return false;

      const currentProject = projectDataRef.current;
      if (!currentProject?.guid || currentProject.revision == null) return false;

      const track = trackManagerRef.current.getTrack(trackId);
      if (!track) return false;

      const region = track.regions.find((item) => item.id === regionId);
      if (!region || !canCopyProjectRegion(region)) {
        showToast({
          message: 'This clip is not ready to split yet.',
          variant: 'error',
        });
        return false;
      }

      const specs = computeSplitClipboardSpecs(region, playheadTime);
      if (!specs.valid) {
        showToast({ message: specs.error, variant: 'error' });
        return false;
      }

      const projectDuration =
        currentProject.durationSeconds ?? AudioState.dawDuration;
      const rightPlacement = computeClipboardPlacement({
        track,
        startTime: specs.right.startTime,
        regionDuration: specs.right.regionDuration,
        projectDuration,
        excludeRegionId: region.id,
      });
      if (!rightPlacement.valid) {
        showToast({ message: rightPlacement.error, variant: 'error' });
        return false;
      }

      const clipId = region.projectClipId;
      clearPendingClipEdit(clipId);

      const leftPatch = buildClipPatchPayload(
        {
          ...region,
          startTime: specs.left.startTime,
          endTime: specs.left.endTime,
          offset: specs.left.offset,
        },
        trackId,
        trackId
      );

      let revisionAfterTrim = currentProject.revision;

      if (isWsConnected()) {
        const lockAcquired = await acquireTrackLock(trackId);
        if (!lockAcquired) {
          showToast({
            message: 'Another collaborator is editing this track.',
            variant: 'error',
          });
          return false;
        }

        const trimResult = await sendProjectOp(
          buildClipOpPayload({
            clipId,
            trackId,
            sourceTrackId: trackId,
            patchPayload: leftPatch,
          })
        );
        releaseTrackLock(trackId);

        if (!trimResult.fallbackRest) {
          if (!trimResult.ok) {
            if (trimResult.code === 'REVISION_MISMATCH') {
              await handleRevisionConflict({
                conflictInfo: {
                  currentRevision: trimResult.currentRevision ?? null,
                  yourRevision: currentProject.revision,
                },
              });
              return false;
            }
            showToast({
              message: trimResult.message || 'Failed to split clip. Please try again.',
              variant: 'error',
            });
            return false;
          }
          applyLocalWsOpResult(trimResult);
          revisionAfterTrim = trimResult.revision;
        } else {
          try {
            const response = await projectApi.updateProjectClip(
              currentProject.guid,
              clipId,
              { revision: currentProject.revision, ...leftPatch }
            );
            applyProjectServerState(response.data);
            revisionAfterTrim = response.data.revision;
          } catch (err) {
            if (isRevisionConflict(err)) {
              await handleRevisionConflict({
                conflictInfo: getRevisionConflictInfo(err),
              });
              return false;
            }
            showToast({
              message:
                err.response?.data?.error ||
                'Failed to split clip. Please try again.',
              variant: 'error',
            });
            return false;
          }
        }
      } else {
        try {
          const response = await projectApi.updateProjectClip(
            currentProject.guid,
            clipId,
            { revision: currentProject.revision, ...leftPatch }
          );
          applyProjectServerState(response.data);
          revisionAfterTrim = response.data.revision;
        } catch (err) {
          if (isRevisionConflict(err)) {
            await handleRevisionConflict({
              conflictInfo: getRevisionConflictInfo(err),
            });
            return false;
          }
          showToast({
            message:
              err.response?.data?.error ||
              'Failed to split clip. Please try again.',
            variant: 'error',
          });
          return false;
        }
      }

      // Ensure place uses the revision after the trim
      if (projectDataRef.current) {
        projectDataRef.current = {
          ...projectDataRef.current,
          revision: revisionAfterTrim,
        };
      }

      const placed = await placeAssetClipWithTrims({
        assetId: region.projectAssetId,
        trackId,
        startTime: specs.right.startTime,
        trimStart: specs.right.trimStart,
        trimEnd: specs.right.trimEnd,
      });

      if (placed) {
        // Prefer selecting the left half (still same clip id) after sync
        selectRegion?.(regionId, trackId);
      }

      return placed;
    },
    [
      acquireTrackLock,
      applyLocalWsOpResult,
      applyProjectServerState,
      canEdit,
      clearPendingClipEdit,
      handleRevisionConflict,
      isWsConnected,
      placeAssetClipWithTrims,
      playheadLocation,
      releaseTrackLock,
      selectRegion,
      selectedRegionId,
      selectedTrackId,
      sendProjectOp,
      showToast,
      trackManagerRef,
    ]
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

  const deleteProjectRegion = useCallback(
    async (regionId, trackId) => {
      const currentProject = projectDataRef.current;
      if (!currentProject?.guid || currentProject.revision == null || !canEdit) return;
      if (!trackManagerRef.current) return;

      const track = trackManagerRef.current.getTrack(trackId);
      if (!track) return;

      const region = track.regions.find((item) => item.id === regionId);
      if (!region) return;

      if (
        isClipInFlight(region.processingStatus) &&
        !isFailedClipStatus(region.processingStatus)
      ) {
        return;
      }

      if (inFlightRegionIdsRef.current.has(region.id)) {
        inFlightRegionIdsRef.current.delete(region.id);
        bumpInFlight(-1);
      }

      const clipId = region.projectClipId;
      if (clipId == null) {
        removeProjectRegionLocally({ trackId: track.id, region });
        return;
      }

      clearPendingClipEdit(clipId);

      if (isWsConnected()) {
        const lockAcquired = await acquireTrackLock(trackId);
        if (!lockAcquired) {
          showToast({
            message: 'Another collaborator is editing this track.',
            variant: 'error',
          });
          return;
        }

        const result = await sendProjectOp(
          buildClipDeleteOpPayload({ clipId, trackId })
        );
        releaseTrackLock(trackId);

        if (!result.fallbackRest) {
          if (result.ok) {
            applyLocalWsOpResult(result);
            notifyProjectMutated();
            return;
          }
          if (result.code === 'REVISION_MISMATCH') {
            await handleRevisionConflict({
              conflictInfo: {
                currentRevision: result.currentRevision ?? null,
                yourRevision: currentProject.revision,
              },
            });
            return;
          }
          showToast({
            message: result.message || 'Failed to delete clip. Please try again.',
            variant: 'error',
          });
          return;
        }
      }

      try {
        const response = await projectApi.deleteProjectClip(
          currentProject.guid,
          clipId,
          { revision: currentProject.revision }
        );
        applyProjectServerState(response.data);
        notifyProjectMutated();
      } catch (err) {
        if (isRevisionConflict(err)) {
          await handleRevisionConflict({
            conflictInfo: getRevisionConflictInfo(err),
          });
          return;
        }

        const message =
          err.response?.data?.error ||
          'Failed to delete clip. Please try again.';
        showToast({ message, variant: 'error' });
      }
    },
    [
      acquireTrackLock,
      applyLocalWsOpResult,
      applyProjectServerState,
      bumpInFlight,
      canEdit,
      clearPendingClipEdit,
      handleRevisionConflict,
      isWsConnected,
      notifyProjectMutated,
      releaseTrackLock,
      sendProjectOp,
      showToast,
      trackManagerRef,
    ]
  );

  const deleteFailedClip = useCallback(
    async (regionId, trackId) => {
      if (!trackManagerRef.current) return;

      const track = trackManagerRef.current.getTrack(trackId);
      if (!track) return;

      const region = track.regions.find((item) => item.id === regionId);
      if (!region) return;
      if (!isFailedClipStatus(region.processingStatus)) return;

      await deleteProjectRegion(regionId, trackId);
    },
    [deleteProjectRegion, trackManagerRef]
  );

  useEffect(() => {
    if (!canEdit || armedTrackId != null || tracks.length === 0) return;
    setArmedTrackIdState(tracks[0].id);
  }, [canEdit, armedTrackId, tracks]);

  useEffect(() => {
    if (projectData?.revision != null) {
      remoteOpQueueRef.current.setLastAppliedRevision(projectData.revision);
    }
  }, [projectData?.revision]);

  useEffect(() => {
    const handleWsStateResync = (data) => {
      const project = data?.project;
      if (!project) return;

      clearPendingEdits();
      remoteOpQueueRef.current.reset();
      remoteOpQueueRef.current.setLastAppliedRevision(project.revision);

      const current = projectDataRef.current;
      applyProjectServerState({
        ...project,
        role: current?.role ?? project.role,
      });
    };

    eventBus.on(DAW_EVENTS.PROJECT.WS_STATE_RESYNC, handleWsStateResync);
    return () => {
      eventBus.off(DAW_EVENTS.PROJECT.WS_STATE_RESYNC, handleWsStateResync);
    };
  }, [applyProjectServerState, clearPendingEdits]);

  useEffect(() => {
    const applyRemoteOpMessage = (opMessage) => {
      const applyChange = () => {
        if (
          !shouldApplyRemoteOp(
            opMessage.payload,
            opMessage.fromUserId,
            user?.id
          )
        ) {
          return;
        }

        if (!trackManagerRef.current) return;

        const isTransportOp = opMessage.payload?.kind === 'project.transport';
        if (isTransportOp) {
          suppressSettingsPersistRef.current = true;
        }

        let applied = false;
        try {
          applied = applyRemoteProjectOp(
            trackManagerRef.current,
            opMessage.payload
          );
        } finally {
          if (isTransportOp) {
            suppressSettingsPersistRef.current = false;
          }
        }

        if (!applied) return;

        const nextTracks = syncTracksFromManager();
        setArmedTrackIdState((current) =>
          current != null && !nextTracks.some((track) => track.id === current)
            ? (nextTracks[0]?.id ?? null)
            : current
        );

        const current = projectDataRef.current;
        if (!current) return;

        const nextState = mergeProjectStateAfterOp(
          current,
          opMessage.payload,
          opMessage.revision
        );

        suppressSettingsPersistRef.current = true;
        try {
          projectDataRef.current = nextState;
          onProjectStateChange?.(nextState);
        } finally {
          suppressSettingsPersistRef.current = false;
        }

        notifyProjectMutated();
      };

      remoteOpQueueRef.current.enqueue(opMessage, applyChange);
    };

    const handleDragStart = () => {
      remoteOpQueueRef.current.setClipDragActive(true);
    };

    const handleDragEnd = () => {
      remoteOpQueueRef.current.setClipDragActive(false);
    };

    eventBus.on(DAW_EVENTS.PROJECT.REMOTE_OP, applyRemoteOpMessage);
    eventBus.on(DAW_EVENTS.PROJECT.CLIP_DRAG_START, handleDragStart);
    eventBus.on(DAW_EVENTS.PROJECT.CLIP_DRAG_END, handleDragEnd);

    return () => {
      eventBus.off(DAW_EVENTS.PROJECT.REMOTE_OP, applyRemoteOpMessage);
      eventBus.off(DAW_EVENTS.PROJECT.CLIP_DRAG_START, handleDragStart);
      eventBus.off(DAW_EVENTS.PROJECT.CLIP_DRAG_END, handleDragEnd);
    };
  }, [
    notifyProjectMutated,
    onProjectStateChange,
    syncTracksFromManager,
    trackManagerRef,
    user?.id,
  ]);

  useEffect(() => {
    if (!canEdit || !projectData?.guid) return;

    const persistSetting = (fields, revertState) => {
      if (suppressSettingsPersistRef.current) return;
      scheduleProjectSettingsPersist({ fields, revertState });
    };

    const handleBpmChange = ({ bpm }) => {
      const previousBpm = projectDataRef.current?.bpm ?? 120;
      if (bpm === previousBpm) return;

      persistSetting({ bpm }, () => {
        eventBus.emit(DAW_EVENTS.METRONOME.BPM_CHANGE, { bpm: previousBpm });
      });
    };

    const handleTimeSignatureChange = ({ timeSignature }) => {
      const previousTimeSignature = projectDataRef.current?.timeSignature ?? '4/4';
      if (timeSignature === previousTimeSignature) return;

      persistSetting({ timeSignature }, () => {
        eventBus.emit(DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, {
          timeSignature: previousTimeSignature,
        });
      });
    };

    const handleMetronomeOffsetChange = ({ offset }) => {
      const previousOffset = projectDataRef.current?.metronomeOffset ?? 0;
      if (offset === previousOffset) return;

      persistSetting({ metronomeOffset: offset }, () => {
        eventBus.emit(DAW_EVENTS.METRONOME.OFFSET_CHANGE, { offset: previousOffset });
      });
    };

    const handleDurationChange = ({ duration: nextDuration }) => {
      const previousDuration = projectDataRef.current?.durationSeconds;
      if (previousDuration == null || nextDuration === previousDuration) return;

      persistSetting({ duration: nextDuration }, () => {
        eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, {
          duration: previousDuration,
        });
      });
    };

    eventBus.on(DAW_EVENTS.METRONOME.BPM_CHANGE, handleBpmChange);
    eventBus.on(DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, handleTimeSignatureChange);
    eventBus.on(DAW_EVENTS.METRONOME.OFFSET_CHANGE, handleMetronomeOffsetChange);
    eventBus.on(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, handleDurationChange);

    return () => {
      eventBus.off(DAW_EVENTS.METRONOME.BPM_CHANGE, handleBpmChange);
      eventBus.off(DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, handleTimeSignatureChange);
      eventBus.off(DAW_EVENTS.METRONOME.OFFSET_CHANGE, handleMetronomeOffsetChange);
      eventBus.off(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, handleDurationChange);
    };
  }, [canEdit, projectData?.guid, scheduleProjectSettingsPersist]);

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
      if (isWsConnected()) {
        const result = await sendProjectOp({ kind: 'track.create' });
        if (!result.fallbackRest) {
          if (result.ok) {
            applyLocalWsOpResult(result);
            notifyProjectMutated();
            return;
          }
          if (result.code === 'REVISION_MISMATCH') {
            await handleRevisionConflict({
              conflictInfo: {
                currentRevision: result.currentRevision ?? null,
                yourRevision: projectData.revision,
              },
            });
            return;
          }
          showToast({
            message: result.message || 'Failed to add track. Please try again.',
            variant: 'error',
          });
          return;
        }
      }

      const response = await projectApi.createProjectTrack(projectData.guid, {
        revision: projectData.revision,
      });
      applyProjectServerState(response.data);
      notifyProjectMutated();
    } catch (err) {
      if (isRevisionConflict(err)) {
        await handleRevisionConflict({
          conflictInfo: getRevisionConflictInfo(err),
        });
      } else {
        const message =
          err.response?.data?.error || 'Failed to add track. Please try again.';
        showToast({ message, variant: 'error' });
      }
    } finally {
      setIsTrackMutationPending(false);
    }
  }, [
    applyLocalWsOpResult,
    applyProjectServerState,
    canEdit,
    handleRevisionConflict,
    isTrackMutationPending,
    isWsConnected,
    notifyProjectMutated,
    projectData,
    sendProjectOp,
    showToast,
    tracks.length,
  ]);

  const deleteProjectTrack = useCallback(
    async (trackId) => {
      if (!canEdit || isTrackMutationPending) return;
      if (!projectData?.guid || projectData.revision == null) return;

      setIsTrackMutationPending(true);
      try {
        if (isWsConnected()) {
          const lockAcquired = await acquireTrackLock(trackId);
          if (!lockAcquired) {
            showToast({
              message: 'Another collaborator is editing this track.',
              variant: 'error',
            });
            return;
          }

          const result = await sendProjectOp({
            kind: 'track.delete',
            trackId,
          });
          releaseTrackLock(trackId);

          if (!result.fallbackRest) {
            if (result.ok) {
              applyLocalWsOpResult(result);
              notifyProjectMutated();
              return;
            }
            if (result.code === 'REVISION_MISMATCH') {
              await handleRevisionConflict({
                conflictInfo: {
                  currentRevision: result.currentRevision ?? null,
                  yourRevision: projectData.revision,
                },
              });
              return;
            }
            showToast({
              message: result.message || 'Failed to delete track. Please try again.',
              variant: 'error',
            });
            return;
          }
        }

        const response = await projectApi.deleteProjectTrack(
          projectData.guid,
          trackId,
          { revision: projectData.revision }
        );
        applyProjectServerState(response.data);
        notifyProjectMutated();
      } catch (err) {
        if (isRevisionConflict(err)) {
          await handleRevisionConflict({
            conflictInfo: getRevisionConflictInfo(err),
          });
        } else {
          const message =
            err.response?.data?.error || 'Failed to delete track. Please try again.';
          showToast({ message, variant: 'error' });
        }
      } finally {
        setIsTrackMutationPending(false);
      }
    },
    [
      acquireTrackLock,
      applyLocalWsOpResult,
      applyProjectServerState,
      canEdit,
      handleRevisionConflict,
      isTrackMutationPending,
      isWsConnected,
      notifyProjectMutated,
      projectData,
      releaseTrackLock,
      sendProjectOp,
      showToast,
    ]
  );

  const applyTrackRenameLocally = useCallback(
    (trackId, name) => {
      const track = trackManagerRef.current?.getTrack(trackId);
      if (!track) return false;

      track.title = name;
      syncTracksFromManager();
      return true;
    },
    [syncTracksFromManager, trackManagerRef]
  );

  const applyTrackReorderLocally = useCallback(
    (orderedTrackIds) => {
      if (!trackManagerRef.current) return false;

      const orders = buildTrackReorderOrders(orderedTrackIds);
      const applied = trackManagerRef.current.reorderTracks(orders);
      if (applied) {
        syncTracksFromManager();
      }
      return applied;
    },
    [syncTracksFromManager, trackManagerRef]
  );

  const renameProjectTrack = useCallback(
    async (trackId, name) => {
      if (!canEdit || isTrackMutationPending) return false;

      const currentProject = projectDataRef.current;
      if (!currentProject?.guid || currentProject.revision == null) return false;

      const validation = validateProjectTrackName(name);
      if (!validation.valid) {
        showToast({ message: validation.error, variant: 'error' });
        return false;
      }

      const existingTrack = trackManagerRef.current?.getTrack(trackId);
      if (!existingTrack) return false;

      const trimmedName = validation.name;
      if (existingTrack.title === trimmedName) {
        return true;
      }

      const previousName = existingTrack.title;
      applyTrackRenameLocally(trackId, trimmedName);

      setIsTrackMutationPending(true);
      try {
        if (isWsConnected()) {
          const lockAcquired = await acquireTrackLock(trackId);
          if (!lockAcquired) {
            applyTrackRenameLocally(trackId, previousName);
            showToast({
              message: 'Another collaborator is editing this track.',
              variant: 'error',
            });
            return false;
          }

          try {
            const result = await sendProjectOp({
              kind: 'track.update',
              trackId,
              name: trimmedName,
            });

            if (!result.fallbackRest) {
              if (result.ok) {
                applyLocalWsOpResult(result);
                notifyProjectMutated();
                return true;
              }

              applyTrackRenameLocally(trackId, previousName);
              if (result.code === 'REVISION_MISMATCH') {
                await handleRevisionConflict({
                  conflictInfo: {
                    currentRevision: result.currentRevision ?? null,
                    yourRevision: currentProject.revision,
                  },
                });
                return false;
              }

              showToast({
                message: result.message || 'Failed to rename track. Please try again.',
                variant: 'error',
              });
              return false;
            }
          } finally {
            releaseTrackLock(trackId);
          }
        }

        const response = await projectApi.updateProjectTrack(
          currentProject.guid,
          trackId,
          { revision: currentProject.revision, name: trimmedName }
        );
        applyProjectServerState(response.data);
        notifyProjectMutated();
        return true;
      } catch (err) {
        applyTrackRenameLocally(trackId, previousName);

        if (isRevisionConflict(err)) {
          await handleRevisionConflict({
            conflictInfo: getRevisionConflictInfo(err),
          });
        } else {
          const message =
            err.response?.data?.error || 'Failed to rename track. Please try again.';
          showToast({ message, variant: 'error' });
        }
        return false;
      } finally {
        setIsTrackMutationPending(false);
      }
    },
    [
      acquireTrackLock,
      applyLocalWsOpResult,
      applyProjectServerState,
      applyTrackRenameLocally,
      canEdit,
      handleRevisionConflict,
      isTrackMutationPending,
      isWsConnected,
      notifyProjectMutated,
      releaseTrackLock,
      sendProjectOp,
      showToast,
      trackManagerRef,
    ]
  );

  const reorderProjectTracks = useCallback(
    async (orderedTrackIds) => {
      if (!canEdit || isTrackMutationPending) return false;

      const currentProject = projectDataRef.current;
      if (!currentProject?.guid || currentProject.revision == null) return false;
      if (!Array.isArray(orderedTrackIds) || orderedTrackIds.length === 0) {
        return false;
      }

      const currentOrder = tracks.map((track) => track.id);
      const orderUnchanged =
        currentOrder.length === orderedTrackIds.length &&
        currentOrder.every((trackId, index) => trackId === orderedTrackIds[index]);
      if (orderUnchanged) {
        return true;
      }

      const previousOrder = [...currentOrder];
      const orders = buildTrackReorderOrders(orderedTrackIds);
      applyTrackReorderLocally(orderedTrackIds);

      setIsTrackMutationPending(true);
      try {
        if (isWsConnected()) {
          const lockAcquired = await acquireMetadataLock();
          if (!lockAcquired) {
            applyTrackReorderLocally(previousOrder);
            showToast({
              message: 'Another collaborator is editing project settings.',
              variant: 'error',
            });
            return false;
          }

          try {
            const result = await sendProjectOp({
              kind: 'track.reorder',
              orders,
            });

            if (!result.fallbackRest) {
              if (result.ok) {
                applyLocalWsOpResult(result);
                notifyProjectMutated();
                return true;
              }

              applyTrackReorderLocally(previousOrder);
              if (result.code === 'REVISION_MISMATCH') {
                await handleRevisionConflict({
                  conflictInfo: {
                    currentRevision: result.currentRevision ?? null,
                    yourRevision: currentProject.revision,
                  },
                });
                return false;
              }

              showToast({
                message: result.message || 'Failed to reorder tracks. Please try again.',
                variant: 'error',
              });
              return false;
            }
          } finally {
            releaseMetadataLock();
          }
        }

        let latestState = currentProject;
        for (const entry of orders) {
          const response = await projectApi.updateProjectTrack(
            currentProject.guid,
            entry.trackId,
            { revision: latestState.revision, sort_order: entry.sortOrder }
          );
          latestState = response.data;
        }

        applyProjectServerState(latestState);
        notifyProjectMutated();
        return true;
      } catch (err) {
        applyTrackReorderLocally(previousOrder);

        if (isRevisionConflict(err)) {
          await handleRevisionConflict({
            conflictInfo: getRevisionConflictInfo(err),
          });
        } else {
          const message =
            err.response?.data?.error || 'Failed to reorder tracks. Please try again.';
          showToast({ message, variant: 'error' });
        }
        return false;
      } finally {
        setIsTrackMutationPending(false);
      }
    },
    [
      acquireMetadataLock,
      applyLocalWsOpResult,
      applyProjectServerState,
      applyTrackReorderLocally,
      canEdit,
      handleRevisionConflict,
      isTrackMutationPending,
      isWsConnected,
      notifyProjectMutated,
      releaseMetadataLock,
      sendProjectOp,
      showToast,
      tracks,
    ]
  );

  const deleteProjectAsset = useCallback(
    async (assetId, { confirm = false } = {}) => {
      const currentProject = projectDataRef.current;
      if (!canEdit || !currentProject?.guid || currentProject.revision == null) {
        return { ok: false };
      }

      try {
        const response = await projectApi.deleteProjectAsset(
          currentProject.guid,
          assetId,
          { revision: currentProject.revision, confirm }
        );
        applyProjectServerState(response.data);
        void deleteCachedProjectAsset({
          projectGuid: currentProject.guid,
          assetId,
        });
        notifyProjectMutated();
        return { ok: true };
      } catch (err) {
        if (err.response?.status === 409 && err.response?.data?.requiresConfirm) {
          return {
            ok: false,
            requiresConfirm: true,
            message:
              err.response?.data?.error ||
              'This file is referenced by a snapshot. Confirm deletion to proceed.',
          };
        }

        if (isRevisionConflict(err)) {
          await handleRevisionConflict({
            conflictInfo: getRevisionConflictInfo(err),
          });
          return { ok: false };
        }

        const message =
          err.response?.data?.error || 'Failed to delete file. Please try again.';
        showToast({ message, variant: 'error' });
        return { ok: false };
      }
    },
    [
      applyProjectServerState,
      canEdit,
      handleRevisionConflict,
      notifyProjectMutated,
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
      renameProjectTrack,
      reorderProjectTracks,
      applyProjectServerState,
      retryClipUpload,
      deleteFailedClip,
      deleteProjectRegion,
      startProjectRecording,
      importAudioFileToTrack,
      placeLibraryAssetOnTrack,
      pasteProjectRegion,
      repeatProjectRegion,
      splitProjectRegion,
      deleteProjectAsset,
      persistClipLayout,
      moveProjectRegion,
      crossTrackDragPreview,
      setCrossTrackDragPreview,
      clearCrossTrackDragPreview,
      isClipInFlight,
      pluginAutoSyncEnabled,
      setPluginAutoSyncEnabled,
      isPluginStale,
      syncProjectToPlugin,
      openProjectInPlugin,
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
      renameProjectTrack,
      reorderProjectTracks,
      applyProjectServerState,
      retryClipUpload,
      deleteFailedClip,
      deleteProjectRegion,
      startProjectRecording,
      importAudioFileToTrack,
      placeLibraryAssetOnTrack,
      pasteProjectRegion,
      repeatProjectRegion,
      splitProjectRegion,
      deleteProjectAsset,
      persistClipLayout,
      moveProjectRegion,
      crossTrackDragPreview,
      setCrossTrackDragPreview,
      clearCrossTrackDragPreview,
      pluginAutoSyncEnabled,
      setPluginAutoSyncEnabled,
      isPluginStale,
      syncProjectToPlugin,
      openProjectInPlugin,
    ]
  );

  return (
    <ProjectEditorContext.Provider value={value}>
      {children}
      <ProjectRevisionConflictDialog
        isOpen={revisionConflictPrompt != null}
        onReload={resolveRevisionConflictReload}
        onDiscard={resolveRevisionConflictDiscard}
      />
    </ProjectEditorContext.Provider>
  );
}

export function useProjectEditor() {
  return useContext(ProjectEditorContext) ?? INACTIVE_PROJECT_EDITOR;
}
