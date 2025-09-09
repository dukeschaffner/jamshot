import DAWConfig from '../misc/DAWConfig.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';
import { bufferRegistry } from '../core/BufferRegistry.js';
import AudioState from './AudioStateStore.js';

class Recorder {
  constructor(audioContext, eventBus) {
    this.context = audioContext;
    this.eventBus = eventBus;
    
    // Recording state
    this.recordingBuffer = null;
    this.recordingProcessor = null;
    this.recordingStream = null;
    this.recordingLatency = 0; // Latency compensation in seconds
    
    // Audio input device tracking
    this.selectedAudioInputDevice = null;
    
    // User latency compensation setting
    this.userLatencyCompensation = 0; // User-defined latency compensation in seconds
    
    // Playback tracking
    this.playbackStartTime = 0; // audioContextTime when playback started
    this.playbackTime = 0; // playback time when playback/recording started
    
    // Bind methods
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.handleRecordingData = this.handleRecordingData.bind(this);
    this.handleRecorderMessage = this.handleRecorderMessage.bind(this);
    this.handlePlaybackStarted = this.handlePlaybackStarted.bind(this);
    this.handleAudioInputDeviceChange = this.handleAudioInputDeviceChange.bind(this);
    this.handleLatencyCompensationChange = this.handleLatencyCompensationChange.bind(this);
    this.handleDeviceChange = this.handleDeviceChange.bind(this);
    
    // Set up event listeners
    this.eventBus.on(DAW_EVENTS.PLAYBACK.STARTED, this.handlePlaybackStarted);
    this.eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, this.handleAudioInputDeviceChange);
    this.eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.LATENCY_COMPENSATION_CHANGE, this.handleLatencyCompensationChange);
    
    // Set up device change detection
    this.setupDeviceChangeDetection();
  }
  
  setupDeviceChangeDetection() {
    // Listen for device changes
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
    }
  }
  
  handleDeviceChange() {
    // When devices change, we need to re-enumerate and potentially update the selected device
    this.enumerateAudioDevices();
  }
  
  async enumerateAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      // If our selected device is no longer available, clear it
      if (this.selectedAudioInputDevice) {
        const deviceStillExists = audioInputs.some(device => device.deviceId === this.selectedAudioInputDevice);
        if (!deviceStillExists) {
          if(audioInputs.length > 0) {
            this.eventBus.emit(DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, { deviceId: audioInputs[0].deviceId });
          }
          else {
            this.eventBus.emit(DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, { deviceId: null });
          }
        }
      }
    } catch (error) {
      console.warn('Error enumerating audio devices:', error);
    }
  }
  
  handleAudioInputDeviceChange(data) {
    this.selectedAudioInputDevice = data.deviceId;
    console.log('Audio input device changed to:', this.selectedAudioInputDevice);
  }
  
  handleLatencyCompensationChange(data) {
    this.userLatencyCompensation = data.value || 0;
    console.log('User latency compensation changed to:', this.userLatencyCompensation);
  }
  
  handlePlaybackStarted(data) {
    if(!AudioState.isRecording) return;
    this.playbackStartTime = data.audioContextTime;
    this.playbackTime = data.playbackTime;
    console.log('Recorder: Playback started - audioContextTime:', this.playbackStartTime, 'playbackTime:', this.playbackTime);
  }
  
  async initialize() {
    // Load the recorder processor
    try {
      await this.context.audioWorklet.addModule('/RecorderProcessor.js');
    } catch (error) {
      console.warn('Could not load recorder processor:', error);
    }
  }
  
  async startRecording() {
    if (AudioState.isRecording) return;
    
    try {
      // Get microphone access with selected device if available
      const audioConstraints = {
        sampleRate: DAWConfig.audio.sampleRate,
        channelCount: DAWConfig.audio.channels,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      };
      
      // Add device selection if a device is selected
      if (this.selectedAudioInputDevice) {
        audioConstraints.deviceId = { exact: this.selectedAudioInputDevice };
      }
      
      this.recordingStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
      
      // Create recording processor
      this.recordingProcessor = new AudioWorkletNode(this.context, 'recorder-processor');
      this.recordingProcessor.port.onmessage = this.handleRecorderMessage;
      
      // Configure processor with buffer size
      this.recordingProcessor.port.postMessage({
        type: 'configure',
        bufferSize: DAWConfig.audio.recordingBufferSize
      });
      
      // Connect microphone to processor
      const source = this.context.createMediaStreamSource(this.recordingStream);
      source.connect(this.recordingProcessor);
      
      // Initialize recording state
      AudioState.isRecording = true;
      this.recordingBuffer = [];
      this.firstSampleTime = null;
      
      // Calculate latency compensation
      this.recordingLatency = this.calculateRecordingLatency();
      
      // Reset processor buffer
      this.recordingProcessor.port.postMessage('reset');
      
      this.eventBus.emit(DAW_EVENTS.RECORDING.STARTED, {
        latency: this.recordingLatency
      });
      
    } catch (error) {
      this.eventBus.emit(DAW_EVENTS.RECORDING.ERROR, error.message);
    }
  }
  
  stopRecording() {
    if (!AudioState.isRecording) return;
    
    AudioState.isRecording = false;
    
    // Stop the media stream
    if (this.recordingStream) {
      this.recordingStream.getTracks().forEach(track => track.stop());
      this.recordingStream = null;
    }
    
    // Disconnect processor
    if (this.recordingProcessor) {
      this.recordingProcessor.port.onmessage = null;
      this.recordingProcessor.disconnect();
      this.recordingProcessor = null;
    }

    const recordingOffset = this.recordingLatency + (this.playbackStartTime - this.firstSampleTime);
    
    // Create final audio buffer
    const finalBuffer = this.createRecordingBuffer();

    console.log('duration', finalBuffer.duration);
    console.log('startTime', this.playbackTime);
    console.log('offset', recordingOffset);
    console.log('sample rate', finalBuffer.sampleRate);
    console.log('channels', finalBuffer.numberOfChannels);

    const bufferKey = bufferRegistry.generateBufferKey('recording-track', 'region');
    bufferRegistry.storeBuffer(bufferKey, finalBuffer);
    
    this.eventBus.emit(DAW_EVENTS.RECORDING.STOPPED, {
      bufferKey: bufferKey,
      duration: finalBuffer ? finalBuffer.duration : 0,
      startTime: this.playbackTime,
      offset: recordingOffset
    });
    
    // Clean up
    this.recordingBuffer = null;
    this.recordingLatency = 0;
  }

  handleRecorderMessage(event){
    if (!AudioState.isRecording) return;

    if (event.data.type === 'first-sample') {
      const { frame, time } = event.data;
      this.firstSampleTime = time; 
      console.log("sample time: " + time);
    }
  
    if (event.data.type === 'audio') {
      const audioBuffer = event.data.data;
      this.handleRecordingData(audioBuffer);
    }
  }
  
  handleRecordingData(data) {
    if (!AudioState.isRecording) return;
    
    const audioData = data;
    if (audioData instanceof Float32Array) {
      this.recordingBuffer.push(audioData);
      
      // Emit progress event
      // const currentTime = this.context.currentTime - this.recordingStartTime + this.recordingOffset;
      // this.eventBus.emit(DAW_EVENTS.RECORDING.PROGRESS, {
      //   currentTime,
      //   bufferLength: this.recordingBuffer.length
      // });
    }
  }
  
  calculateRecordingLatency() {
    // Estimate latency based on buffer size and sample rate
    const outputLatency = this.context.outputLatency;
    const userCompensation = this.userLatencyCompensation;
    const totalLatency = outputLatency + userCompensation;
    
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
    
    // Copy data to buffer
    const channelData = audioBuffer.getChannelData(0);
    let writeOffset = 0;
    
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
    return AudioState.isRecording;
  }
  
  getRecordingTime() {
    if (!AudioState.isRecording) return 0;
    return this.context.currentTime - this.playbackStartTime + this.playbackTime;
  }
  
  // Cleanup
  destroy() {
    // Stop recording if active
    if (AudioState.isRecording) {
      this.stopRecording();
    }
    
    // Remove event listeners
    this.eventBus.off(DAW_EVENTS.PLAYBACK.STARTED, this.handlePlaybackStarted);
    this.eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, this.handleAudioInputDeviceChange);
    this.eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.LATENCY_COMPENSATION_CHANGE, this.handleLatencyCompensationChange);
    if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);
    }
  }
}

export default Recorder; 