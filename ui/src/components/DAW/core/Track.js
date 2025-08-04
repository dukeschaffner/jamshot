// Track.js - Individual track management
class Track {
  constructor(id, context, buffer) {
    this.id = id;
    this.context = context;
    this.buffer = buffer;
    this.gainNode = context.createGain();
    this.analyzer = context.createAnalyser();
    this.sources = new Set();
    this.duration = buffer ? buffer.duration : 0;
  }
  
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
  
  stop() {
    this.pause();
  }
  
  destroy() {
    this.pause();
    this.gainNode.disconnect();
    this.analyzer.disconnect();
  }
  
  // Utility methods
  getDuration() {
    return this.duration;
  }
  
  setVolume(volume) {
    this.gainNode.gain.value = volume;
  }
  
  getVolume() {
    return this.gainNode.gain.value;
  }
}

export default Track;