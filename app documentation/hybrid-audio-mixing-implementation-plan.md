# Hybrid Audio Mixing Implementation Plan

## Executive Summary

This document outlines the implementation of a hybrid audio mixing strategy for JamShot that combines the benefits of pre-mixed normalized audio for streaming performance with preserved original stems for DAW flexibility. The plan addresses current scalability and quality issues while maintaining backward compatibility.

## Current System Analysis

### Problems with Existing Approach

1. **Accumulative Quality Loss**: Each collaboration remixes the entire audio chain, introducing compression artifacts with each iteration
2. **Performance Degradation**: Long collaboration chains (trackA → trackAB → trackABC → trackABCD) require progressively longer processing times
3. **Storage Inefficiency**: Each collaboration stores a full remixed version, leading to exponential storage growth
4. **Limited Flexibility**: Once mixed, individual track adjustments are impossible
5. **Streaming Latency**: No pre-normalized versions optimized for web playback

### Current Architecture

- **Original Track**: Single file normalized for consistency
- **Collaboration Track**: Raw upload + mixed version of (parent_mixed + new_recording)
- **Storage**: `audio_url` (raw) + `combined_audio_url` (mixed)
- **DAW**: Loads only parent mixed audio + new recording (2-track limit)

## Hybrid Solution Architecture

### Core Concept

**Store both pre-mixed normalized versions AND original stems:**
- `combined_audio_url`: Pre-mixed, normalized version for instant streaming
- `audio_url`: Latest stem (original recording) for DAW reconstruction
- `mix_gains`: JSON metadata storing gain values used in mixing
- Use `parent_track_id` chain to reconstruct complete stem collection

### Data Flow

```
Original Track (A):
├── audio_url: trackA.mp3 (original stem)
├── combined_audio_url: trackA_normalized.mp3 (streaming version)
└── mix_gains: {"stems": [{"track_id": 1, "gain": 1.0, "order": 0}]}

Collaboration (A + B = AB):
├── audio_url: trackB.mp3 (latest stem)
├── combined_audio_url: trackAB_mixed.mp3 (streaming version)
├── mix_gains: {
│   "stems": [
│     {"track_id": 1, "gain": 0.8, "order": 0},  // Track A
│     {"track_id": 2, "gain": 0.8, "order": 1}   // Track B
│   ]
│ }
└── parent_track_id: points to track A

Collaboration (AB + C = ABC):
├── audio_url: trackC.mp3 (latest stem)
├── combined_audio_url: trackABC_mixed.mp3 (streaming version)
├── mix_gains: {
│   "stems": [
│     {"track_id": 1, "gain": 0.8, "order": 0},  // Track A (inherited)
│     {"track_id": 2, "gain": 0.8, "order": 1},  // Track B (inherited)
│     {"track_id": 3, "gain": 0.7, "order": 2}   // Track C (new)
│   ]
│ }
└── parent_track_id: points to track AB
```

### Streaming vs. DAW Loading

**For Streaming Playback:**
1. Use `combined_audio_url` (pre-mixed, normalized)
2. Instant loading, optimized for web playback
3. No real-time processing required

**For DAW Editing:**
1. Load current track's `audio_url` (latest stem)
2. Recursively follow `parent_track_id` to load all ancestor stems
3. Apply gain values from `mix_gains` metadata
4. Present all stems as individual tracks with gain controls

## Implementation Phases

### Phase 1: Database Foundation (Week 1)

#### Database Schema Changes
```sql
-- Add mix_gains column for storing gain metadata
ALTER TABLE tracks ADD COLUMN mix_gains JSONB;

-- Add index for performance
CREATE INDEX idx_tracks_mix_gains ON tracks USING GIN (mix_gains);

-- Migrate existing collaboration tracks
UPDATE tracks
SET mix_gains = jsonb_build_object(
  'parent_gain', 0.8,
  'recording_gain', 0.8,
  'created_at', created_at,
  'version', 'legacy'
)
WHERE parent_track_id IS NOT NULL AND mix_gains IS NULL;
```

#### Mix Gains Structure (Complete Stem Chain)
```json
{
  "stems": [
    {"track_id": 1, "gain": 0.8, "order": 0},  // Parent stem A
    {"track_id": 2, "gain": 0.8, "order": 1}   // Current stem B (added post-insertion)
  ],
  "version": "hybrid_v1",
  "created_at": "2025-09-19T10:00:00Z"
}
```

**Note:** Uses two-phase insertion to handle self-referencing ID issue:
1. Insert track with placeholder mix_gains
2. Get generated track ID
3. Update mix_gains with complete stem information including current track's ID

#### Backend API Updates
- Update track creation endpoint to store mix_gains
- Add endpoint to retrieve stem chain for DAW loading
- Update track metadata processing

#### Files to Modify
- `api/src/routes/tracks.js` (upload endpoint)
- `api/src/utils/trackUtils.js` (add stem chain utilities)
- `api/shared/utils/audio.js` (stem processing utilities)

### Phase 2: Backend Processing Logic (Week 2)

#### Enhanced Upload Processing (Two-Phase Insertion)
```javascript
// Phase 1: Insert track with placeholder mix_gains
let placeholderMixGains;
if (parent_track_id) {
  // For collaborations, inherit parent stems temporarily
  const parentStems = parentTrack.mix_gains?.stems || [];
  placeholderMixGains = {
    stems: parentStems,  // Temporary: only parent stems
    status: 'incomplete',
    version: 'hybrid_v1'
  };
} else {
  // For original tracks, start with empty stems
  placeholderMixGains = {
    stems: [],
    version: 'hybrid_v1'
  };
}

const result = await pool.query(
  'INSERT INTO tracks (user_id, title, audio_url, combined_audio_url, ...) VALUES (..., $15) RETURNING id',
  [userId, title, audioUrl, combinedAudioUrl, ..., JSON.stringify(placeholderMixGains)]
);

const newTrackId = result.rows[0].id;

// Phase 2: Complete mix_gains with current track's stem
let completeMixGains;
if (parent_track_id) {
  // For collaborations: inherit parent stems + add current stem
  const parentStems = parentTrack.mix_gains?.stems || [];
  completeMixGains = {
    stems: [
      ...parentStems,
      {
        track_id: newTrackId,
        gain: parsedRecordingGain,
        order: parentStems.length
      }
    ],
    version: 'hybrid_v1',
    created_at: new Date().toISOString()
  };
} else {
  // For original tracks: just add current stem
  completeMixGains = {
    stems: [{
      track_id: newTrackId,
      gain: 1.0,  // Original tracks start at full volume
      order: 0
    }],
    version: 'hybrid_v1',
    created_at: new Date().toISOString()
  };
}

// Update with complete stem information
await pool.query(
  'UPDATE tracks SET mix_gains = $1 WHERE id = $2',
  [JSON.stringify(completeMixGains), newTrackId]
);
```

#### Stem Chain Reconstruction
```javascript
// New utility function in trackUtils.js
async function getStemChain(trackId) {
  // Get the track with its complete stem information
  const trackResult = await pool.query(
    'SELECT id, audio_url, combined_audio_url, mix_gains FROM tracks WHERE id = $1',
    [trackId]
  );

  if (!trackResult.rows[0]) {
    throw new Error('Track not found');
  }

  const track = trackResult.rows[0];
  const mixGains = track.mix_gains;

  if (!mixGains?.stems) {
    // Fallback for tracks without complete stem info
    return [{
      track_id: track.id,
      audio_url: track.audio_url,
      gain: 1.0,
      order: 0
    }];
  }

  // Get audio URLs for all stems in the chain
  const stemIds = mixGains.stems.map(stem => stem.track_id);
  const stemsQuery = await pool.query(
    'SELECT id, audio_url FROM tracks WHERE id = ANY($1)',
    [stemIds]
  );

  // Create lookup map for audio URLs
  const audioUrlMap = {};
  stemsQuery.rows.forEach(row => {
    audioUrlMap[row.id] = row.audio_url;
  });

  // Build complete stem information
  const stems = mixGains.stems.map(stem => ({
    track_id: stem.track_id,
    audio_url: audioUrlMap[stem.track_id],
    gain: stem.gain,
    order: stem.order
  }));

  // Sort by order to maintain proper sequence
  return stems.sort((a, b) => a.order - b.order);
}
```

#### Quality Monitoring
```javascript
// Add audio quality metrics
const qualityMetrics = {
  original_loudness: measureLoudness(originalBuffer),
  mixed_loudness: measureLoudness(mixedBuffer),
  compression_artifacts: detectArtifacts(mixedBuffer),
  thd_percentage: measureTHD(mixedBuffer)
};
```

### Phase 3: Frontend DAW Integration (Week 3)

#### TrackManager Updates
```javascript
// ui/src/components/DAW/core/TrackManager.js
class TrackManager {
  // Load stem chain for DAW using complete stem information
  async loadStemChain(trackData) {
    // Track already has complete stem information in mix_gains
    const mixGains = trackData.mix_gains;

    if (!mixGains?.stems) {
      // Fallback for legacy tracks
      return [this.createTrackFromData(trackData)];
    }

    // Load all stem audio files in parallel
    const stemPromises = mixGains.stems.map(async (stem, index) => {
      const buffer = await getAudioBufferFromS3(stem.audio_url);
      return {
        id: stem.track_id,
        buffer: buffer,
        gain: stem.gain,
        order: stem.order,
        name: `Stem ${index + 1} (Track ${stem.track_id})`
      };
    });

    const stems = await Promise.all(stemPromises);

    // Sort by order and create tracks
    return stems
      .sort((a, b) => a.order - b.order)
      .map(stem => this.createTrackFromStem(stem));
  }

  createTrackFromStem(stemData) {
    const track = new Track(stemData.id, this.audioContext);
    track.setGain(stemData.gain);
    track.addRegionFromBuffer(stemData.buffer, stemData.name);
    track.setOrder(stemData.order); // For proper track arrangement
    return track;
  }

  // Fallback method for legacy tracks
  createTrackFromData(trackData) {
    const track = new Track(trackData.id, this.audioContext);
    track.setGain(1.0);
    track.addRegionFromUrl(trackData.audio_url, trackData.title);
    return track;
  }
}
```

#### DAW Context Updates
```javascript
// ui/src/components/DAW/DAWContext.js
useEffect(() => {
  const initializeDAW = async () => {
    // Detect if track has stems available
    const hasStems = trackData?.mix_gains || trackData?.parent_track_id;

    if (hasStems && isCollab) {
      // Load stem chain for full editing
      await tm.loadStemChain(trackData);
    } else {
      // Use existing single/mixed track loading
      await tm.loadAllTracks(trackData);
    }

    // Create empty recording track
    tm.createEmptyTrack('recording-track');
  };
}, [trackData]);
```

#### UI Enhancements
- Add stem count indicator in DAW
- Show gain controls for each stem
- Add stem solo/mute functionality
- Display stem chain hierarchy

### Phase 4: Quality Assurance & Optimization (Week 4)

#### Testing Strategy
1. **Unit Tests**: Stem loading, gain application, chain reconstruction
2. **Integration Tests**: Full upload-to-DAW workflow
3. **Performance Tests**: Loading times for various chain lengths
4. **Audio Quality Tests**: Measure degradation across generations

#### Performance Optimizations
```javascript
// Implement stem caching
const stemCache = new Map();

async function getCachedStem(audioUrl) {
  if (stemCache.has(audioUrl)) {
    return stemCache.get(audioUrl);
  }

  const buffer = await getAudioBufferFromS3(audioUrl);
  stemCache.set(audioUrl, buffer);
  return buffer;
}

// Lazy loading for long chains
async function loadStemChainProgressive(trackId, onStemLoaded) {
  const chain = await getStemChain(trackId);

  for (const stem of chain) {
    const buffer = await getCachedStem(stem.audio_url);
    onStemLoaded(stem, buffer);
  }
}
```

#### Audio Quality Validation
```javascript
// Quality gates for uploads
const QUALITY_THRESHOLDS = {
  max_thd: 0.5, // Total Harmonic Distortion
  min_loudness: -20, // LUFS
  max_loudness: -8, // LUFS
  max_compression_ratio: 0.1
};

function validateAudioQuality(buffer) {
  const metrics = analyzeBuffer(buffer);

  return Object.entries(QUALITY_THRESHOLDS).every(
    ([metric, threshold]) => {
      const value = metrics[metric];
      return metric.startsWith('max_') ? value <= threshold : value >= threshold;
    }
  );
}
```

## Migration Strategy

### Backward Compatibility
- **Existing Tracks**: Continue using `combined_audio_url` for streaming
- **New Tracks**: Use hybrid approach with stems
- **API Compatibility**: All existing endpoints remain functional
- **Graceful Degradation**: If stems unavailable, fall back to mixed version

### Data Migration (Complete Stem Chain)
```sql
-- Step 1: Add new column without downtime
ALTER TABLE tracks ADD COLUMN mix_gains JSONB;

-- Step 2: Migrate original tracks (no parent)
UPDATE tracks
SET mix_gains = jsonb_build_object(
  'stems', json_build_array(
    jsonb_build_object(
      'track_id', id,
      'gain', 1.0,
      'order', 0
    )
  ),
  'version', 'migrated_original',
  'migrated_at', NOW()
)
WHERE parent_track_id IS NULL
  AND mix_gains IS NULL;

-- Step 3: Migrate collaboration tracks (have parent)
-- This requires reconstructing stem chains from parent relationships
-- Run as background job due to complexity
UPDATE tracks
SET mix_gains = (
  -- Complex query to reconstruct complete stem chain
  SELECT jsonb_build_object(
    'stems', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'track_id', stem_track.id,
          'gain', CASE
            WHEN stem_track.id = tracks.id THEN 0.8  -- Current track
            ELSE 0.8  -- Parent tracks (simplified)
          END,
          'order', stem_track.layer
        ) ORDER BY stem_track.created_at
      )
      FROM tracks stem_track
      WHERE stem_track.id IN (
        -- Get all ancestor track IDs including current
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_track_id, 0 as depth
          FROM tracks t
          WHERE t.id = tracks.id

          UNION ALL

          SELECT t.id, t.parent_track_id, a.depth + 1
          FROM tracks t
          JOIN ancestors a ON t.id = a.parent_track_id
        )
        SELECT id FROM ancestors
      )
    ),
    'version', 'migrated_collab',
    'migrated_at', NOW()
  )
)
WHERE parent_track_id IS NOT NULL
  AND mix_gains IS NULL;

-- Step 4: Generate missing stem files
-- Background job to extract individual stems from existing mixed files
-- This is complex and may require manual processing for existing tracks
```

### Rollback Plan
- **Quick Rollback**: Remove mix_gains column usage, revert to old logic
- **Data Preservation**: Keep mix_gains column for future use
- **Feature Flags**: Use feature flags to enable/disable hybrid features

## Success Metrics

### Performance Metrics
- **Streaming Load Time**: < 2 seconds for any track length
- **DAW Load Time**: < 10 seconds for 5+ stem chains
- **Storage Growth**: < 50% increase vs. current approach
- **Audio Quality**: THD < 0.5% across all generations

### User Experience Metrics
- **DAW Responsiveness**: No lag when adjusting stem gains
- **Upload Success Rate**: > 99% success rate
- **Collaboration Completion**: > 95% of collaborations reach upload stage
- **User Satisfaction**: > 4.5/5 rating for audio quality

### Business Metrics
- **Storage Cost**: Maintain or reduce per-track storage cost
- **Server Load**: Reduce CPU usage for audio processing by 40%
- **User Retention**: Maintain or improve engagement metrics
- **Feature Adoption**: > 70% of collaborations use stem editing

## Risk Assessment & Mitigation

### High Risk Items
1. **Audio Quality Degradation**: Mitigated by quality monitoring and validation
2. **Storage Cost Increase**: Mitigated by efficient stem storage and cleanup
3. **Complex DAW Loading**: Mitigated by progressive loading and caching

### Medium Risk Items
1. **Database Migration**: Mitigated by background processing and rollback capability
2. **Browser Compatibility**: Mitigated by fallbacks and progressive enhancement
3. **Performance Regression**: Mitigated by comprehensive testing and monitoring

### Low Risk Items
1. **API Changes**: Backward compatible design
2. **User Interface Changes**: Gradual rollout with feature flags
3. **Third-party Dependencies**: No new dependencies required

## Timeline & Milestones

### Week 1: Foundation ✅
- [x] Database schema changes
- [x] Basic mix_gains storage
- [x] API endpoint updates

### Week 2: Backend Processing ✅
- [x] Enhanced upload processing
- [x] Stem chain reconstruction logic
- [x] Quality monitoring implementation

### Week 3: Frontend Integration 🔄
- [ ] TrackManager stem loading
- [ ] DAW context updates
- [ ] UI enhancements for stem controls

### Week 4: Testing & Optimization 🔄
- [ ] Unit and integration tests
- [ ] Performance optimization
- [ ] Quality assurance validation

### Week 5: Production Deployment 📅
- [ ] Beta testing with select users
- [ ] Performance monitoring
- [ ] User feedback collection
- [ ] Full production rollout

### Week 6: Monitoring & Iteration 📅
- [ ] Post-launch monitoring
- [ ] Performance analytics
- [ ] User feedback analysis
- [ ] Iterative improvements

## Success Criteria

### Technical Success
- ✅ All existing functionality preserved
- ✅ New hybrid approach working for new collaborations
- ✅ No performance regression for streaming
- ✅ DAW can load and edit all stems using complete stem chain information
- ✅ Two-phase insertion handles self-referencing ID issue
- ✅ Backward compatibility maintained for legacy tracks

### User Success
- ✅ Streaming performance maintained or improved
- ✅ DAW responsiveness for stem editing
- ✅ Audio quality consistent across collaboration lengths
- ✅ User interface intuitive and discoverable

### Business Success
- ✅ Storage costs managed effectively
- ✅ Server resources utilized efficiently
- ✅ User engagement maintained or increased
- ✅ Technical debt reduced for future scalability

## Conclusion

This hybrid approach with complete stem chains provides the optimal solution for scalable audio collaboration. By using two-phase insertion to handle the self-referencing ID issue, we can store complete stem information in each track, enabling:

- **Instant streaming** with pre-mixed normalized versions
- **Full DAW flexibility** with individual stem editing
- **Quality preservation** through original stem maintenance
- **Scalability** without exponential storage growth
- **Backward compatibility** with graceful degradation

The complete stem chain approach eliminates complex parent chain traversals during DAW loading, providing better performance and simpler reconstruction logic. The two-phase insertion method ensures data consistency while avoiding race conditions.

This foundation enables future enhancements like real-time collaboration, advanced effects processing, and professional mixing tools while maintaining the simplicity of the current user experience.
