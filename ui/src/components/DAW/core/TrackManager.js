// ui/src/components/DAW/core/TrackManager.js
import { bufferRegistry } from './BufferRegistry.js';
import { getAudioBufferFromS3 } from '../misc/DAWUtils.js';
import Track from './Track.js';
import { eventBus } from '../misc/EventBus.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';
import AudioState from './AudioStateStore.js';
import api from '../../../lib/api.js';
import { CLIP_PROCESSING_STATUS } from '../project/projectClipUpload.js';

class TrackManager {
  constructor(audioContext) {
    this.tracks = new Map(); // trackId -> Track instance
    this.audioContext = audioContext;
    this.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Load stem chain for DAW using complete stem information
  async loadStemChain(trackData) {
    try {
      // Call the stems API endpoint to get complete stem information with signed URLs
      const stemsResponse = await api.get(`/tracks/${trackData.id}/stems`, {
        params: { includeUserDetails: true },
      });
      const stemsData = stemsResponse.data;

      if (!stemsData || stemsData.length === 0) {
        // Fallback if stems endpoint fails
        return [await this.createTrackFromData(trackData)];
      }

      // Load all stem audio files in parallel
      const stemPromises = stemsData.map(async (stem, index) => {
        const buffer = await getAudioBufferFromS3(stem.audio_url, this.audioContext);
        return {
          id: stem.track_id,
          buffer: buffer,
          gain: stem.gain,
          order: stem.order,
          title: stem.title,
          username: stem.username,
          verified: stem.verified,
          profile_pic_url: stem.profile_pic_url,
          regions: stem.regions || [],
          name: `Stem ${index + 1} (Track ${stem.track_id})`
        };
      });

      const stems = await Promise.all(stemPromises);

      // Sort by order and create tracks
      const tracks = stems
        .sort((a, b) => a.order - b.order)
        .map(stem => this.createTrackFromStem(stem));

      // Set DAW duration from longest stem
      const durations = tracks.map(track => track.calculateTotalDuration());
      const maxDuration = Math.max(...durations);
      AudioState.dawDuration = maxDuration;
      eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: maxDuration });

      return tracks;

    } catch (error) {
      console.error('Error loading stem chain:', error);
      // Fallback to legacy loading on error
      return [await this.createTrackFromData(trackData)];
    }
  }

  createTrackFromStem(stemData) {
    const bufferKey = bufferRegistry.generateBufferKey(stemData.id, 'stem-region');

    // Store buffer in registry
    bufferRegistry.storeBuffer(bufferKey, stemData.buffer, {
      name: 'stem-region',
      trackId: stemData.id
    });

    const track = new Track(stemData.id, this.audioContext, [], stemData.title, {
      username: stemData.username,
      profile_pic_url: stemData.profile_pic_url,
      verified: stemData.verified,
    });
    track.setGain(stemData.gain);
    
    // Add regions if present, otherwise add a single region covering the full buffer
    if (stemData.regions && stemData.regions.length > 0) {
      // Add each region from the stem data
      stemData.regions.forEach(region => {
        track.addRegion(bufferKey, region.startTime, region.offset, region.endTime, 'stem-region');
      });
    } else {
      // Default: add a single region covering the full buffer
      track.addRegion(bufferKey, null, null, null, 'stem-region');
    }

    this.tracks.set(stemData.id, track);
    return track;
  }

  // Fallback method for legacy tracks
  async createTrackFromData(trackData) {
    const regionName = "region";
    const bufferKey = bufferRegistry.generateBufferKey(trackData.id, regionName);

    // Load buffer from S3
    const buffer = await getAudioBufferFromS3(trackData.combined_audio_url || trackData.audio_url, this.audioContext);

    // Store in registry
    bufferRegistry.storeBuffer(bufferKey, buffer, {
      name: regionName,
      trackId: trackData.id
    });

    const track = new Track(trackData.id, this.audioContext, [], trackData.title, {
      username: trackData.username,
      profile_pic_url: trackData.profile_pic_url,
      verified: trackData.verified,
    });
    track.setGain(1.0);
    track.addRegion(bufferKey, null, null, null, regionName);

    this.tracks.set(trackData.id, track);
    return track;
  }

  // Legacy method for backward compatibility
  async loadTrack(trackData) {
    return (await this.loadStemChain(trackData))[0];
  }

  // Load multiple tracks (legacy method)
  async loadAllTracks(tracksData) {
    const loadPromises = tracksData.map(trackData =>
      this.loadStemChain(trackData)
    );

    const trackArrays = await Promise.all(loadPromises);
    const allTracks = trackArrays.flat();

    const trackDurations = await Promise.all(allTracks.map(track => track.calculateTotalDuration()));
    const maxDuration = Math.max(...trackDurations);
    AudioState.dawDuration = maxDuration;
    eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: AudioState.dawDuration });

    return allTracks;
  }

  // Create an empty track for recording
  createEmptyTrack(id = 'recording-track') {
    if (!this.audioContext) {
      eventBus.emit(DAW_EVENTS.ERROR.AUDIO, 'Audio context not found');
      return null;
    }
    
    // Create an empty track with no regions
    const track = new Track(id, this.audioContext);
    
    this.tracks.set(id, track);
    eventBus.emit(DAW_EVENTS.TRACK.ADD, { track });
    
    return track;
  }
  
  getTrack(id) {
    return this.tracks.get(id);
  }
  
  getAllTracks() {
    return Array.from(this.tracks.values());
  }

  // #region projects


  /**
   * Load project tracks and clips from GET /projects/:id state.
   * Only clips with a completed audioUrl are loaded for playback.
   */
  async loadProject(projectState) {
    const projectTracks = [...(projectState?.tracks || [])].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );

    const loadPromises = projectTracks.map(async (trackData) => {
      const track = new Track(trackData.id, this.audioContext, [], trackData.name);
      track.setGain(trackData.gain ?? 0.8);
      track.isMuted = !!trackData.muted;
      track.isSolo = !!trackData.solo;

      const clipPromises = (trackData.clips || [])
        .filter((clip) => clip.audioUrl)
        .map(async (clip) => {
          const buffer = await getAudioBufferFromS3(clip.audioUrl, this.audioContext);
          const bufferKey = bufferRegistry.generateBufferKey(
            trackData.id,
            `clip-${clip.id}`
          );
          bufferRegistry.storeBuffer(bufferKey, buffer, {
            name: `clip-${clip.id}`,
            trackId: trackData.id,
            clipId: clip.id,
          });

          const trimStart = clip.trimStart ?? 0;
          const startTime = clip.startTime ?? 0;
          let endTime;
          if (clip.trimEnd != null) {
            endTime = startTime + (clip.trimEnd - trimStart);
          } else if (clip.duration != null) {
            endTime = startTime + clip.duration;
          } else {
            endTime = startTime + buffer.duration - trimStart;
          }

          const region = track.addRegion(
            bufferKey,
            startTime,
            trimStart,
            endTime,
            trackData.name || `Clip ${clip.id}`,
            false,
            false,
            null,
            true
          );

          if (region) {
            region.projectClipId = clip.id;
            region.projectAssetId = clip.assetId ?? null;
            region.processingStatus = CLIP_PROCESSING_STATUS.COMPLETED;
          }
        });

      await Promise.all(clipPromises);
      this.tracks.set(trackData.id, track);
      eventBus.emit(DAW_EVENTS.TRACK.ADD, { track });
      return track;
    });

    const tracks = await Promise.all(loadPromises);

    const projectDuration =
      projectState?.durationSeconds ?? AudioState.dawDuration;
    AudioState.dawDuration = projectDuration;
    eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: projectDuration });

    return tracks;
  }

  removeTrack(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return;

    if (track.destroy) {
      track.destroy();
    }
    this.tracks.delete(trackId);
    eventBus.emit(DAW_EVENTS.TRACK.REMOVE, { trackId });
  }

  addEmptyProjectTrack(trackData) {
    const track = new Track(trackData.id, this.audioContext, [], trackData.name);
    track.setGain(trackData.gain ?? 0.8);
    track.isMuted = !!trackData.muted;
    track.isSolo = !!trackData.solo;
    this.tracks.set(trackData.id, track);
    eventBus.emit(DAW_EVENTS.TRACK.ADD, { track });
    return track;
  }

  /**
   * Sync local tracks with server project state after track add/remove.
   * Clip layout reload is handled on full page load; clip edits come in later steps.
   */
  applyProjectState(projectState) {
    const sortedTracks = [...(projectState?.tracks || [])].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );
    const newTrackIds = new Set(sortedTracks.map((track) => track.id));

    for (const trackId of [...this.tracks.keys()]) {
      if (!newTrackIds.has(trackId)) {
        this.removeTrack(trackId);
      }
    }

    for (const trackData of sortedTracks) {
      if (!this.tracks.has(trackData.id)) {
        this.addEmptyProjectTrack(trackData);
        continue;
      }

      const track = this.tracks.get(trackData.id);
      track.title = trackData.name;
      track.setGain(trackData.gain ?? 0.8);
      track.isMuted = !!trackData.muted;
      track.isSolo = !!trackData.solo;
    }

    if (projectState?.durationSeconds != null) {
      AudioState.dawDuration = projectState.durationSeconds;
      eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, {
        duration: projectState.durationSeconds,
      });
    }

    return this.getAllTracks();
  }

  moveRegionBetweenTracks(fromTrackId, toTrackId, regionId, updatedRegion) {
    const fromTrack = this.tracks.get(fromTrackId);
    const toTrack = this.tracks.get(toTrackId);
    if (!fromTrack || !toTrack) return false;

    const regionIndex = fromTrack.regions.findIndex((item) => item.id === regionId);
    if (regionIndex === -1) return false;

    const region = { ...fromTrack.regions[regionIndex], ...updatedRegion };

    if (fromTrackId === toTrackId) {
      fromTrack.regions[regionIndex] = region;
      eventBus.emit(DAW_EVENTS.REGION.UPDATE, { region, trackId: fromTrackId });
      return true;
    }

    fromTrack.regions.splice(regionIndex, 1);
    eventBus.emit(DAW_EVENTS.REGION.REMOVED, {
      region,
      trackId: fromTrackId,
      recordUndo: false,
    });

    toTrack.regions.push(region);
    eventBus.emit(DAW_EVENTS.REGION.ADDED, { region, trackId: toTrackId });
    return true;
  }

  // #endregion
  
  destroy() {
    // Cleanup tracks
    this.tracks.forEach(track => {
      if (track.destroy) {
        track.destroy();
      }
    });
    this.tracks.clear();
  }
}

export default TrackManager;