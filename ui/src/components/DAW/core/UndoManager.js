// ui/src/components/DAW/core/UndoManager.js
import { eventBus } from '../misc/EventBus.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';

/**
 * Command types for undo/redo operations
 */
export const COMMAND_TYPES = {
  REGION_MOVE: 'region:move',
  REGION_CROP: 'region:crop',
  REGION_ADD: 'region:add',
  REGION_REMOVE: 'region:remove',
  REGION_SPLIT: 'region:split',
  TRACK_VOLUME: 'track:volume',
  TRACK_SOLO: 'track:solo',
};

/**
 * UndoManager - Manages undo/redo history for DAW operations
 * Uses the Command Pattern to store reversible operations
 */
class UndoManager {
  constructor(maxHistory = 50) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = maxHistory;
    this.isPerformingUndoRedo = false; // Flag to prevent recording during undo/redo
  }

  /**
   * Initialize event listeners
   * Listens to REGION events and extracts action metadata for undo/redo
   */
  init() {
    // Listen for region events with optional action metadata
    eventBus.on(DAW_EVENTS.REGION.ADDED, this.handleRegionAdded.bind(this));
    eventBus.on(DAW_EVENTS.REGION.UPDATED, this.handleRegionUpdated.bind(this));
    eventBus.on(DAW_EVENTS.REGION.REMOVED, this.handleRegionRemoved.bind(this));
  }

  /**
   * Destroy and cleanup event listeners
   */
  destroy() {
    eventBus.off(DAW_EVENTS.REGION.ADDED, this.handleRegionAdded.bind(this));
    eventBus.off(DAW_EVENTS.REGION.UPDATED, this.handleRegionUpdated.bind(this));
    eventBus.off(DAW_EVENTS.REGION.REMOVED, this.handleRegionRemoved.bind(this));
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Handle REGION.ADDED events - extract action metadata and record if undoable
   * @param {Object} data - Event data with region, trackId, and optional action metadata
   */
  handleRegionAdded(data) {
    if (!data.action?.canUndo || this.isPerformingUndoRedo) return;
    
    const { region, trackId, action } = data;
    
    this.recordCommand({
      type: action.type || COMMAND_TYPES.REGION_ADD,
      trackId,
      regionId: region.id,
      before: null,
      after: {
        startTime: region.startTime,
        endTime: region.endTime,
        offset: region.offset,
        key: region.key,
        duration: region.duration,
        active: region.active,
        name: region.name
      },
      description: action.description || 'Add Region'
    });
  }

  /**
   * Handle REGION.UPDATED events - extract action metadata and record if undoable
   * @param {Object} data - Event data with region, trackId, and optional action metadata
   */
  handleRegionUpdated(data) {
    if (!data.action?.canUndo || this.isPerformingUndoRedo) return;
    
    const { region, trackId, action } = data;
    
    this.recordCommand({
      type: action.type || COMMAND_TYPES.REGION_MOVE,
      trackId,
      regionId: region.id,
      before: action.before,
      after: {
        startTime: region.startTime,
        endTime: region.endTime,
        offset: region.offset,
        key: region.key,
        duration: region.duration,
        active: region.active,
        name: region.name
      },
      description: action.description || 'Update Region'
    });
  }

  /**
   * Handle REGION.REMOVED events - extract action metadata and record if undoable
   * @param {Object} data - Event data with region, trackId, and optional action metadata
   */
  handleRegionRemoved(data) {
    if (!data.action?.canUndo || this.isPerformingUndoRedo) return;
    
    const { region, trackId, action } = data;
    
    this.recordCommand({
      type: action.type || COMMAND_TYPES.REGION_REMOVE,
      trackId,
      regionId: region.id,
      before: action.before || {
        startTime: region.startTime,
        endTime: region.endTime,
        offset: region.offset,
        key: region.key,
        duration: region.duration,
        active: region.active,
        name: region.name
      },
      after: null,
      description: action.description || 'Delete Region'
    });
  }

  /**
   * Record a command for undo/redo
   * @param {Object} command - The command object
   * @param {string} command.type - Type of command (COMMAND_TYPES)
   * @param {string} command.trackId - ID of the track affected
   * @param {Object} command.before - State before the change
   * @param {Object} command.after - State after the change
   * @param {string} [command.description] - Human-readable description
   */
  recordCommand(command) {
    // Don't record commands during undo/redo operations
    if (this.isPerformingUndoRedo) {
      return;
    }

    const timestampedCommand = {
      ...command,
      timestamp: Date.now(),
    };

    this.undoStack.push(timestampedCommand);

    // Limit history size
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    // Clear redo stack when a new command is recorded
    this.redoStack = [];

    // Emit state change event
    this.emitStateChange();
  }

  /**
   * Undo the last command
   * @param {Object} trackManager - Reference to TrackManager for applying changes
   * @returns {boolean} - Whether undo was successful
   */
  undo(trackManager) {
    if (!this.canUndo()) {
      console.log('Nothing to undo');
      return false;
    }

    this.isPerformingUndoRedo = true;

    const command = this.undoStack.pop();
    
    try {
      this.applyCommand(trackManager, command, true);
      this.redoStack.push(command);
      this.emitStateChange();
      console.log('Undo:', command.type, command.description || '');
      return true;
    } catch (error) {
      console.error('Error during undo:', error);
      // Put the command back on the undo stack
      this.undoStack.push(command);
      return false;
    } finally {
      this.isPerformingUndoRedo = false;
    }
  }

  /**
   * Redo the last undone command
   * @param {Object} trackManager - Reference to TrackManager for applying changes
   * @returns {boolean} - Whether redo was successful
   */
  redo(trackManager) {
    if (!this.canRedo()) {
      console.log('Nothing to redo');
      return false;
    }

    this.isPerformingUndoRedo = true;

    const command = this.redoStack.pop();
    
    try {
      this.applyCommand(trackManager, command, false);
      this.undoStack.push(command);
      this.emitStateChange();
      console.log('Redo:', command.type, command.description || '');
      return true;
    } catch (error) {
      console.error('Error during redo:', error);
      // Put the command back on the redo stack
      this.redoStack.push(command);
      return false;
    } finally {
      this.isPerformingUndoRedo = false;
    }
  }

  /**
   * Apply a command (for undo or redo)
   * @param {Object} trackManager - Reference to TrackManager
   * @param {Object} command - The command to apply
   * @param {boolean} isUndo - Whether this is an undo (true) or redo (false)
   */
  applyCommand(trackManager, command, isUndo) {
    const state = isUndo ? command.before : command.after;
    const track = trackManager.getTrack(command.trackId);

    if (!track) {
      console.error('Track not found:', command.trackId);
      return;
    }

    switch (command.type) {
      case COMMAND_TYPES.REGION_MOVE:
      case COMMAND_TYPES.REGION_CROP:
        this.applyRegionUpdate(track, command, state);
        break;

      case COMMAND_TYPES.REGION_ADD:
        if (isUndo) {
          this.applyRegionRemove(track, command);
        } else {
          this.applyRegionRestore(track, command);
        }
        break;

      case COMMAND_TYPES.REGION_REMOVE:
        if (isUndo) {
          this.applyRegionRestore(track, command);
        } else {
          this.applyRegionRemove(track, command);
        }
        break;

      case COMMAND_TYPES.REGION_SPLIT:
        this.applyRegionSplit(track, command, isUndo);
        break;

      case COMMAND_TYPES.TRACK_VOLUME:
        track.setGain(state.gain);
        eventBus.emit(DAW_EVENTS.TRACK.VOLUME_CHANGE, {
          trackId: command.trackId,
          gain: state.gain
        });
        break;

      case COMMAND_TYPES.TRACK_SOLO:
        track.setSolo(state.isSolo);
        eventBus.emit(DAW_EVENTS.TRACK.SOLO, {
          trackId: command.trackId,
          isSolo: state.isSolo
        });
        break;

      default:
        console.warn('Unknown command type:', command.type);
    }
  }

  /**
   * Apply a region update (move or crop)
   */
  applyRegionUpdate(track, command, state) {
    const region = track.regions.find(r => r.id === command.regionId);
    
    if (!region) {
      console.error('Region not found:', command.regionId);
      return;
    }

    // Update region properties
    region.startTime = state.startTime;
    region.endTime = state.endTime;
    region.offset = state.offset;

    // Emit update event to refresh UI
    eventBus.emit(DAW_EVENTS.REGION.UPDATED, { 
      region: { ...region }, 
      trackId: command.trackId 
    });
  }

  /**
   * Remove a region (for undoing add or redoing remove)
   */
  applyRegionRemove(track, command) {
    const regionIndex = track.regions.findIndex(r => r.id === command.regionId);
    
    if (regionIndex === -1) {
      console.error('Region not found for removal:', command.regionId);
      return;
    }

    const region = track.regions[regionIndex];
    track.regions.splice(regionIndex, 1);

    // Emit removed event to refresh UI
    eventBus.emit(DAW_EVENTS.REGION.REMOVED, { 
      region: region, 
      trackId: command.trackId 
    });
  }

  /**
   * Restore a region (for undoing remove or redoing add)
   */
  applyRegionRestore(track, command) {
    const state = command.before || command.after;

    // Create the region object from saved state
    const region = {
      id: command.regionId,
      key: state.key,
      startTime: state.startTime,
      endTime: state.endTime,
      offset: state.offset,
      duration: state.duration,
      active: state.active !== undefined ? state.active : true,
      name: state.name || 'Region'
    };

    // Add region back to track
    track.regions.push(region);

    // Emit added event to refresh UI
    eventBus.emit(DAW_EVENTS.REGION.ADDED, {
      region: region,
      trackId: command.trackId
    });
  }

  /**
   * Apply region split operation (for undo/redo)
   */
  applyRegionSplit(track, command, isUndo) {
    if (isUndo) {
      // Undo: Remove the two split regions and restore the original region
      if (command.after.leftRegion) {
        this.applyRegionRemoveById(track, command.after.leftRegion.id);
      }
      if (command.after.rightRegion) {
        this.applyRegionRemoveById(track, command.after.rightRegion.id);
      }

      // Restore the original region
      const originalRegion = {
        id: command.regionId,
        key: command.before.key,
        startTime: command.before.startTime,
        endTime: command.before.endTime,
        offset: command.before.offset,
        duration: command.before.duration,
        active: command.before.active !== undefined ? command.before.active : true,
        name: command.before.name || 'Region'
      };

      track.regions.push(originalRegion);
      eventBus.emit(DAW_EVENTS.REGION.ADDED, {
        region: originalRegion,
        trackId: command.trackId
      });
    } else {
      // Redo: Remove the original region and restore the two split regions
      this.applyRegionRemoveById(track, command.regionId);

      // Restore the two split regions
      if (command.after.leftRegion) {
        const leftRegion = { ...command.after.leftRegion };
        track.regions.push(leftRegion);
        eventBus.emit(DAW_EVENTS.REGION.ADDED, {
          region: leftRegion,
          trackId: command.trackId
        });
      }

      if (command.after.rightRegion) {
        const rightRegion = { ...command.after.rightRegion };
        track.regions.push(rightRegion);
        eventBus.emit(DAW_EVENTS.REGION.ADDED, {
          region: rightRegion,
          trackId: command.trackId
        });
      }
    }
  }

  /**
   * Remove a region by ID (helper method for region split)
   */
  applyRegionRemoveById(track, regionId) {
    const regionIndex = track.regions.findIndex(r => r.id === regionId);

    if (regionIndex === -1) {
      console.error('Region not found for removal:', regionId);
      return;
    }

    const region = track.regions[regionIndex];
    track.regions.splice(regionIndex, 1);

    // Emit removed event to refresh UI
    eventBus.emit(DAW_EVENTS.REGION.REMOVED, {
      region: region,
      trackId: track.id
    });
  }


  /**
   * Check if undo is available
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   * @returns {boolean}
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Get the description of the next undo action
   * @returns {string|null}
   */
  getUndoDescription() {
    if (!this.canUndo()) return null;
    const command = this.undoStack[this.undoStack.length - 1];
    return command.description || this.getDefaultDescription(command.type, true);
  }

  /**
   * Get the description of the next redo action
   * @returns {string|null}
   */
  getRedoDescription() {
    if (!this.canRedo()) return null;
    const command = this.redoStack[this.redoStack.length - 1];
    return command.description || this.getDefaultDescription(command.type, false);
  }

  /**
   * Get default description for a command type
   */
  getDefaultDescription(type, isUndo) {
    const action = isUndo ? 'Undo' : 'Redo';
    switch (type) {
      case COMMAND_TYPES.REGION_MOVE:
        return `${action} Move Region`;
      case COMMAND_TYPES.REGION_CROP:
        return `${action} Crop Region`;
      case COMMAND_TYPES.REGION_ADD:
        return `${action} Add Region`;
      case COMMAND_TYPES.REGION_REMOVE:
        return `${action} Delete Region`;
      case COMMAND_TYPES.TRACK_VOLUME:
        return `${action} Volume Change`;
      case COMMAND_TYPES.TRACK_SOLO:
        return `${action} Solo Toggle`;
      default:
        return `${action}`;
    }
  }

  /**
   * Emit state change event for UI updates
   */
  emitStateChange() {
    eventBus.emit(DAW_EVENTS.UNDO.STATE_CHANGE, {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoDescription: this.getUndoDescription(),
      redoDescription: this.getRedoDescription(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length
    });
  }

  /**
   * Clear all undo/redo history
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.emitStateChange();
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      undoStack: this.undoStack.map(c => ({ type: c.type, description: c.description })),
      redoStack: this.redoStack.map(c => ({ type: c.type, description: c.description })),
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    };
  }
}

// Export singleton instance
export const undoManager = new UndoManager();

export default UndoManager;


