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
import {
  decodeAudioFile,
  getProjectMaxImportDuration,
  validateClipPlacement,
  buildClipPatchPayload,
} from './projectClipPlacement';
import { useProjectPersistence } from '@/hooks/useProjectPersistence';
import { useProjectPluginAutoSync } from '@/hooks/useProjectPluginAutoSync';
import { applyProjectTransportSettings } from './projectLoader';
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
  mergeTransportIntoProjectState,
  shouldApplyRemoteOp,
} from './projectRemoteOpApplier';
import { ProjectRemoteOpQueue } from './projectRemoteOpQueue';
import { bufferRegistry } from '../core/BufferRegistry';

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
  importAudioFileToTrack: async () => {},
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
  const { trackManagerRef, tracks, syncTracksFromManager } = useDAW();

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

      suppressSettingsPersistRef.current = true;
      try {
        trackManagerRef.current.applyProjectState(nextState);
        applyProjectTransportSettings(nextState);
        const nextTracks = syncTracksFromManager();
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

  const { scheduleClipPersist, scheduleProjectSettingsPersist, handleRevisionConflict, clearPendingEdits } =
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
    [applyProjectServerState, handleRevisionConflict, notifyProjectMutated, showToast, trackManagerRef]
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

        let nextState = { ...current, revision: opMessage.revision };
        nextState = mergeTransportIntoProjectState(nextState, opMessage.payload);

        if (opMessage.payload?.kind === 'track.create') {
          const trackExists = (nextState.tracks || []).some(
            (track) => track.id === opMessage.payload.trackId
          );
          if (!trackExists) {
            nextState = {
              ...nextState,
              tracks: [
                ...(nextState.tracks || []),
                {
                  id: opMessage.payload.trackId,
                  name: opMessage.payload.name,
                  sortOrder: opMessage.payload.sortOrder,
                  gain: opMessage.payload.gain,
                  muted: opMessage.payload.muted,
                  solo: opMessage.payload.solo,
                  clips: [],
                },
              ],
            };
          }
        }

        if (opMessage.payload?.kind === 'track.delete') {
          nextState = {
            ...nextState,
            tracks: (nextState.tracks || []).filter(
              (track) => track.id !== opMessage.payload.trackId
            ),
          };
        }

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
            onRevisionOnlyUpdate(result.revision);
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
    applyProjectServerState,
    canEdit,
    handleRevisionConflict,
    isTrackMutationPending,
    isWsConnected,
    notifyProjectMutated,
    onRevisionOnlyUpdate,
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
              onRevisionOnlyUpdate(result.revision);
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
      applyProjectServerState,
      canEdit,
      handleRevisionConflict,
      isTrackMutationPending,
      isWsConnected,
      notifyProjectMutated,
      onRevisionOnlyUpdate,
      projectData,
      releaseTrackLock,
      sendProjectOp,
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
      importAudioFileToTrack,
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
      applyProjectServerState,
      retryClipUpload,
      deleteFailedClip,
      startProjectRecording,
      importAudioFileToTrack,
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
