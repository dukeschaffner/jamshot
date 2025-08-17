import DAWConfig from '../misc/DAWConfig.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';
import { bufferRegistry } from '../core/BufferRegistry.js';

class Recorder {
  constructor(audioContext, eventBus) {
    this.context = audioContext;
    this.eventBus = eventBus;
    
    // Recording state
    this.isRecording = false;
    this.recordingStartTime = 0; // When recording started in context time
    this.recordingOffset = 0; // Offset within the recording buffer
    this.recordingBuffer = null;
    this.recordingProcessor = null;
    this.recordingStream = null;
    this.recordingLatency = 0; // Latency compensation in seconds
    
    // Bind methods
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.handleRecordingData = this.handleRecordingData.bind(this);
  }
  
  async initialize() {
    // Load the recorder processor
    try {
      await this.context.audioWorklet.addModule('/RecorderProcessor.js');
    } catch (error) {
      console.warn('Could not load recorder processor:', error);
    }
    
    // Listen for recording events
    this.eventBus.on(DAW_EVENTS.RECORDING.START, this.startRecording);
    this.eventBus.on(DAW_EVENTS.RECORDING.STOP, this.stopRecording);
  }
  
  async startRecording() {
    if (this.isRecording) return;
    
    try {
      // Get microphone access
      this.recordingStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: DAWConfig.audio.sampleRate,
          channelCount: DAWConfig.audio.channels,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      
      // Create recording processor
      this.recordingProcessor = new AudioWorkletNode(this.context, 'recorder-processor');
      this.recordingProcessor.port.onmessage = this.handleRecordingData;
      
      // Configure processor with buffer size
      this.recordingProcessor.port.postMessage({
        type: 'configure',
        bufferSize: DAWConfig.audio.recordingBufferSize
      });
      
      // Connect microphone to processor
      const source = this.context.createMediaStreamSource(this.recordingStream);
      source.connect(this.recordingProcessor);
      
      // Initialize recording state
      this.isRecording = true;
      this.recordingStartTime = this.context.currentTime;
      this.recordingOffset = 0; // Will be set by AudioEngine
      this.recordingBuffer = [];
      
      // Calculate latency compensation
      this.recordingLatency = this.calculateRecordingLatency();
      
      // Reset processor buffer
      this.recordingProcessor.port.postMessage('reset');
      
      this.eventBus.emit(DAW_EVENTS.RECORDING.STARTED, {
        startTime: this.recordingOffset,
        latency: this.recordingLatency
      });
      
    } catch (error) {
      this.eventBus.emit(DAW_EVENTS.RECORDING.ERROR, error.message);
    }
  }
  
  stopRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    
    // Stop the media stream
    if (this.recordingStream) {
      this.recordingStream.getTracks().forEach(track => track.stop());
      this.recordingStream = null;
    }
    
    // Disconnect processor
    if (this.recordingProcessor) {
      this.recordingProcessor.disconnect();
      this.recordingProcessor = null;
    }
    
    // Create final audio buffer
    const finalBuffer = this.createRecordingBuffer();

    const bufferKey = bufferRegistry.generateBufferKey('recording-track', 'region');
    bufferRegistry.storeBuffer(bufferKey, finalBuffer);
    
    this.eventBus.emit(DAW_EVENTS.RECORDING.STOPPED, {
      bufferKey: bufferKey,
      duration: finalBuffer ? finalBuffer.duration : 0,
      startTime: this.recordingOffset
    });
    
    // Clean up
    this.recordingBuffer = null;
    this.recordingStartTime = 0;
    this.recordingOffset = 0;
    this.recordingLatency = 0;
  }
  
  handleRecordingData(event) {
    if (!this.isRecording) return;
    
    const audioData = event.data;
    if (audioData instanceof Float32Array) {
      this.recordingBuffer.push(audioData);
      
      // Emit progress event
      const currentTime = this.context.currentTime - this.recordingStartTime + this.recordingOffset;
      this.eventBus.emit(DAW_EVENTS.RECORDING.PROGRESS, {
        currentTime,
        bufferLength: this.recordingBuffer.length
      });
    }
  }
  
  calculateRecordingLatency() {
    // Estimate latency based on buffer size and sample rate
    const bufferLatency = DAWConfig.audio.recordingBufferSize / DAWConfig.audio.sampleRate;
    const processingLatency = 0.01; // Conservative estimate for processing delay
    const additionalCompensation = DAWConfig.audio.recordingLatencyCompensation;
    const totalLatency = bufferLatency + processingLatency + additionalCompensation;
    
    return totalLatency;
  }
  
  createRecordingBuffer() {
    if (!this.recordingBuffer || this.recordingBuffer.length === 0) {
      return null;
    }
    
    // Calculate total length
    const totalLength = this.recordingBuffer.reduce((sum, buffer) => sum + buffer.length, 0);
    
    // Create audio buffer
    const audioBuffer = this.context.createBuffer(
      DAWConfig.audio.channels,
      totalLength,
      DAWConfig.audio.sampleRate
    );
    
    // Copy data to buffer with latency compensation
    const channelData = audioBuffer.getChannelData(0);
    
    // Apply latency compensation by shifting the audio data
    const latencySamples = Math.round(this.recordingLatency * DAWConfig.audio.sampleRate);
    let writeOffset = latencySamples;
    
    for (let i = 0; i < this.recordingBuffer.length; i++) {
      const buffer = this.recordingBuffer[i];
      const copyLength = Math.min(buffer.length, channelData.length - writeOffset);
      
      if (copyLength > 0) {
        channelData.set(buffer.subarray(0, copyLength), writeOffset);
        writeOffset += copyLength;
      }
    }
    
    return audioBuffer;
  }
  
  // Recording utility methods
  isRecordingActive() {
    return this.isRecording;
  }
  
  getRecordingTime() {
    if (!this.isRecording) return 0;
    return this.context.currentTime - this.recordingStartTime + this.recordingOffset;
  }
  
  setRecordingOffset(offset) {
    this.recordingOffset = offset;
  }
  
  // Cleanup
  destroy() {
    // Stop recording if active
    if (this.isRecording) {
      this.stopRecording();
    }
    
    // Remove event listeners
    if (this.eventBus) {
      this.eventBus.off(DAW_EVENTS.RECORDING.START, this.startRecording);
      this.eventBus.off(DAW_EVENTS.RECORDING.STOP, this.stopRecording);
    }
  }
}

export default Recorder; 