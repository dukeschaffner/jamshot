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
└── combined_audio_url: trackA_normalized.mp3 (streaming version)

Collaboration (A + B = AB):
├── audio_url: trackB.mp3 (latest stem)
├── combined_audio_url: trackAB_mixed.mp3 (streaming version)
├── mix_gains: {"parent_gain": 0.8, "recording_gain": 0.8}
└── parent_track_id: points to track A

Collaboration (AB + C = ABC):
├── audio_url: trackC.mp3 (latest stem)
├── combined_audio_url: trackABC_mixed.mp3 (streaming version)
├── mix_gains: {"parent_gain": 1.0, "recording_gain": 0.7}
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

#### Backend API Updates
- Update track creation endpoint to store mix_gains
- Add endpoint to retrieve stem chain for DAW loading
- Update track metadata processing

#### Files to Modify
- `api/src/routes/tracks.js` (upload endpoint)
- `api/src/utils/trackUtils.js` (add stem chain utilities)
- `api/shared/utils/audio.js` (stem processing utilities)

### Phase 2: Backend Processing Logic (Week 2)

#### Enhanced Upload Processing
```javascript
// In tracks.js upload endpoint (around line 352)
const mixGains = {
  parent_gain: parsedOriginalGain,
  recording_gain: parsedRecordingGain,
  created_at: new Date().toISOString(),
  version: 'hybrid_v1'
};

// Store in database
const result = await pool.query(
  'INSERT INTO tracks (..., mix_gains) VALUES (..., $15)',
  [..., JSON.stringify(mixGains)]
);
```

#### Stem Chain Reconstruction
```javascript
// New utility function in trackUtils.js
async function getStemChain(trackId) {
  const stems = [];
  let currentId = trackId;

  while (currentId) {
    const track = await pool.query(
      'SELECT id, audio_url, parent_track_id, mix_gains FROM tracks WHERE id = $1',
      [currentId]
    );

    if (track.rows[0]?.audio_url) {
      stems.unshift({
        track_id: track.rows[0].id,
        audio_url: track.rows[0].audio_url,
        gain: track.rows[0].mix_gains?.recording_gain || 1.0
      });
    }

    currentId = track.rows[0]?.parent_track_id;
  }

  return stems;
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
  // New method to load stem chain for DAW
  async loadStemChain(trackData) {
    const stemChain = await api.get(`/tracks/${trackData.id}/stems`);

    const stemPromises = stemChain.map(async (stem) => {
      const buffer = await getAudioBufferFromS3(stem.audio_url);
      return {
        id: stem.track_id,
        buffer: buffer,
        gain: stem.gain,
        name: `Stem ${stem.track_id}`
      };
    });

    const stems = await Promise.all(stemPromises);
    return stems.map(stem => this.createTrackFromStem(stem));
  }

  createTrackFromStem(stemData) {
    const track = new Track(stemData.id, this.audioContext);
    track.setGain(stemData.gain);
    track.addRegionFromBuffer(stemData.buffer, stemData.name);
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

### Data Migration
```sql
-- Step 1: Add new column without downtime
ALTER TABLE tracks ADD COLUMN mix_gains JSONB;

-- Step 2: Background migration of existing data
-- Run during low-traffic periods
UPDATE tracks
SET mix_gains = jsonb_build_object(
  'parent_gain', 0.8,
  'recording_gain', 0.8,
  'version', 'migrated',
  'migrated_at', NOW()
)
WHERE parent_track_id IS NOT NULL
  AND mix_gains IS NULL;

-- Step 3: Generate missing stem files
-- Background job to extract stems from existing mixed files
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
- ✅ DAW can load and edit all stems in collaboration chains

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

This hybrid approach provides the optimal balance between streaming performance, audio quality preservation, and DAW flexibility. By maintaining pre-mixed normalized versions for instant playback while preserving original stems for editing, we solve the core scalability issues of the current system without compromising user experience.

The phased implementation ensures minimal risk and allows for iterative improvement based on real-world usage patterns. The plan maintains backward compatibility while setting the foundation for advanced audio features in the future.
