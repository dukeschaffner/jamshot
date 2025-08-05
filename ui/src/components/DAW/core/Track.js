// Track.js - Individual track management
class Track {
  /**
   * Creates a new Track instance
   * @param {string} id - Unique identifier for the track
   * @param {AudioContext} context - Web Audio context for audio processing
   * @param {AudioBuffer} buffer - Audio buffer containing the track data
   */
  constructor(id, context, buffer) {
    this.id = id;
    this.context = context;
    this.buffer = buffer;
    this.gainNode = context.createGain();
    this.analyzer = context.createAnalyser();
    this.sources = new Set();
    this.duration = buffer ? buffer.duration : 0;
  }
  
  /**
   * Starts playback of the track
   * @param {number} startTime - When to start playback (in seconds from AudioContext.currentTime)
   * @param {number} offset - Offset within the audio buffer to start from (in seconds)
   * @returns {AudioBufferSourceNode|null} - The created audio source node, or null if no buffer
   */
  play(startTime, offset = 0) {
    if (!this.buffer) return;
    
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gainNode);
    this.gainNode.connect(this.analyzer);
    this.gainNode.connect(this.context.destination);
    source.start(startTime, offset);
    this.sources.add(source);
    return source;
  }
  
  /**
   * Stops all currently playing sources for this track
   */
  pause() {
    this.sources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source may have already stopped
      }
    });
    this.sources.clear();
  }
  
  /**
   * Stops playback (alias for pause)
   */
  stop() {
    this.pause();
  }
  
  /**
   * Cleans up all audio resources for this track
   */
  destroy() {
    this.pause();
    this.gainNode.disconnect();
    this.analyzer.disconnect();
  }
  
  /**
   * Gets the duration of the track in seconds
   * @returns {number} - Duration in seconds
   */
  getDuration() {
    return this.duration;
  }
  
  /**
   * Sets the volume of the track
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume) {
    this.gainNode.gain.value = volume;
  }
  
  /**
   * Gets the current volume of the track
   * @returns {number} - Current volume level (0.0 to 1.0)
   */
  getVolume() {
    return this.gainNode.gain.value;
  }
}

export default Track;