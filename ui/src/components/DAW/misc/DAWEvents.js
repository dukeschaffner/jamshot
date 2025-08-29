// Event constants for type safety
export const DAW_EVENTS = {
    // Transport events
    TRANSPORT: {
      PLAY: 'transport:play',
      PAUSE: 'transport:pause',
      STOP: 'transport:stop',
      SEEK: 'transport:seek',
      LOOP_TOGGLE: 'transport:loop:toggle',
      LOOP_SET: 'transport:loop:set'
    },
    
    // Recording events
    RECORDING: {
      START: 'recording:start',
      STARTED: 'recording:started',
      STOP: 'recording:stop',
      STOPPED: 'recording:stopped',
      ERROR: 'recording:error',
      PROGRESS: 'recording:progress'
    },
    
    // Playback events
    PLAYBACK: {
      STARTED: 'playback:started',
      STOPPED: 'playback:stopped',
      PAUSED: 'playback:paused',
      POSITION_UPDATE: 'playback:position:update',
      DURATION_CHANGE: 'playback:duration:change'
    },
    
    // Metronome events
    METRONOME: {
      CLICK: 'metronome:click',
      BEAT: 'metronome:beat',
      MEASURE: 'metronome:measure',
      START: 'metronome:start',
      STOP: 'metronome:stop',
      BPM_CHANGE: 'metronome:bpm:change',
      TIME_SIGNATURE_CHANGE: 'metronome:time_signature:change',
      OFFSET_CHANGE: 'metronome:offset:change',
      COUNT_IN_TOGGLE: 'metronome:count_in:toggle',
      TOGGLE: 'metronome:toggle'
    },
    
    // Track events
    TRACK: {
      ADD: 'track:add',
      REMOVE: 'track:remove',
      SELECT: 'track:select',
      MUTE: 'track:mute',
      SOLO: 'track:solo',
      VOLUME_CHANGE: 'track:volume:change',
      PAN_CHANGE: 'track:pan:change'
    },

    REGION: {
      ADD: 'region:add',
      REMOVE: 'region:remove',
      SELECT: 'region:select',
      UPDATE: 'region:update',
      REAL_TIME_UPDATE: 'region:real_time_update',
      SEGMENT_UPDATE: 'region:segment_update',
      CROSSFADE_START: 'region:crossfade_start',
      CROSSFADE_END: 'region:crossfade_end'
    },
    
    // Take events
    TAKE: {
      CREATE: 'take:create',
      SELECT: 'take:select',
      DELETE: 'take:delete',
      CROP: 'take:crop',
      RENAME: 'take:rename'
    },
    
    // UI events
    UI: {
      PLAYHEAD_DRAG_START: 'ui:playhead:drag:start',
      PLAYHEAD_DRAG_END: 'ui:playhead:drag:end',
      LOOP_DRAG_START: 'ui:loop:drag:start',
      LOOP_DRAG_END: 'ui:loop:drag:end',
      ZOOM_CHANGE: 'ui:zoom:change',
      VIEW_CHANGE: 'ui:view:change'
    },
    
    // Audio engine events
    AUDIO: {
      CONTEXT_SUSPENDED: 'audio:context:suspended',
      CONTEXT_RESUMED: 'audio:context:resumed',
      BUFFER_LOADED: 'audio:buffer:loaded',
      BUFFER_ERROR: 'audio:buffer:error',
      PROCESSING_START: 'audio:processing:start',
      PROCESSING_END: 'audio:processing:end'
    },
    
    // Segment events
    SEGMENT: {
      SCHEDULED: 'segment:scheduled',
      COMPLETED: 'segment:completed',
      CANCELLED: 'segment:cancelled',
      UPDATED: 'segment:updated',
      ERROR: 'segment:error',
      SCHEDULER_STARTED: 'segment:scheduler:started',
      SCHEDULER_STOPPED: 'segment:scheduler:stopped',
      SCHEDULER_DESTROYED: 'segment:scheduler:destroyed',
      SCHEDULING_UPDATE: 'segment:scheduling:update'
    },
    
    // Error events
    ERROR: {
      AUDIO: 'error:audio',
      NETWORK: 'error:network',
      PERMISSION: 'error:permission',
      GENERIC: 'error:generic'
    }
  };