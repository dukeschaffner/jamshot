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
    this.streamSampleRate = null; // Sample rate from the input stream
    this.recordingLatency = {latency:0, autoLatency:0, userCompensation:0}; // Latency compensation in seconds
    
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
    this.handleDeviceChange = this.handleDeviceChange.bind(this);
    this.ownsRecordingStream = false;
    
    // Set up event listeners
    this.eventBus.on(DAW_EVENTS.PLAYBACK.STARTED, this.handlePlaybackStarted);
    this.eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, this.handleAudioInputDeviceChange);
    
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
      if (AudioState.selectedAudioInputDevice) {
        const deviceStillExists = audioInputs.some(device => device.deviceId === AudioState.selectedAudioInputDevice);
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
    AudioState.selectedAudioInputDevice = data.deviceId;
    console.log('Audio input device changed to:', AudioState.selectedAudioInputDevice);
  }
  
  handlePlaybackStarted(data) {
    if(!AudioState.isRecording) return;
    this.playbackStartTime = data.audioContextTime;
    this.playbackTime = data.playbackTime;
  }
  
  async initialize() {
    // Load the recorder processor
    try {
      await this.context.audioWorklet.addModule('/RecorderProcessor.js');
    } catch (error) {
      console.warn('Could not load recorder processor:', error);
    }
  }
  
  async startRecording(stream) {
    if (AudioState.isRecording) return;
    
    try {
      // If a stream was provided (e.g. from input monitoring), reuse it
      this.ownsRecordingStream = false;
      if (stream) {
        this.recordingStream = stream;
        // Capture sample rate from the stream
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          const settings = audioTrack.getSettings();
          this.streamSampleRate = settings.sampleRate || this.context.sampleRate;


          // Show toast if sample rate is > 48kHz
          if (this.streamSampleRate > 48000) {
            this.eventBus.emit(DAW_EVENTS.NOTIFICATION.TOAST, {
              variant: 'info',
              title: 'High Sample Rate Detected',
              message: `Your input is using ${this.streamSampleRate / 1000}kHz. For best results, use 44.1kHz or 48kHz.`,
              duration: 5000
            });
          }
        }
      } else {
        // Get microphone access with selected device if available
        const audioConstraints = {
          sampleRate: DAWConfig.audio.sampleRate,
          channelCount: DAWConfig.audio.channels,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        };
        
        // Add device selection if a device is selected
        if (AudioState.selectedAudioInputDevice) {
          audioConstraints.deviceId = { exact: AudioState.selectedAudioInputDevice };
        }
        
        this.recordingStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints
        });
        this.ownsRecordingStream = true;

        // Capture sample rate from the newly created stream
        const audioTrack = this.recordingStream.getAudioTracks()[0];
        if (audioTrack) {
          const settings = audioTrack.getSettings();
          this.streamSampleRate = settings.sampleRate || this.context.sampleRate;

          // Show toast if sample rate is > 48kHz
          if (this.streamSampleRate > 48000) {
            this.eventBus.emit(DAW_EVENTS.NOTIFICATION.TOAST, {
              variant: 'info',
              title: 'High Sample Rate Detected',
              message: `Your input is using ${this.streamSampleRate / 1000}kHz. For best results, use 44.1kHz or 48kHz.`,
              duration: 5000
            });
          }
        }
      }
      
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
    if (this.recordingStream && this.ownsRecordingStream) {
      this.recordingStream.getTracks().forEach(track => track.stop());
      this.recordingStream = null;
    }
    
    // Disconnect processor
    if (this.recordingProcessor) {
      this.recordingProcessor.port.onmessage = null;
      this.recordingProcessor.disconnect();
      this.recordingProcessor = null;
    }

    const recordingOffset = this.recordingLatency.latency + (this.playbackStartTime - this.firstSampleTime);
    
    // Create final audio buffer
    const finalBuffer = this.createRecordingBuffer();

    const targetTrackId = AudioState.recordingTargetTrackId || 'recording-track';
    const bufferKey = bufferRegistry.generateBufferKey(targetTrackId, 'region');
    bufferRegistry.storeBuffer(bufferKey, finalBuffer, {
      name: 'region',
      trackId: targetTrackId,
    });

    this.eventBus.emit(DAW_EVENTS.RECORDING.STOPPED, {
      bufferKey,
      trackId: targetTrackId,
      duration: finalBuffer ? finalBuffer.duration : 0,
      startTime: this.playbackTime,
      offset: recordingOffset,
      latencyData: this.recordingLatency,
    });
    
    // Clean up
    this.recordingBuffer = null;
    this.recordingLatency = {latency:0, autoLatency:0, userCompensation:0};
  }

  handleRecorderMessage(event){
    if (!AudioState.isRecording) return;

    if (event.data.type === 'first-sample') {
      const { frame, time } = event.data;
      this.firstSampleTime = time; 
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
    const base = this.context.baseLatency || 0;
    const output = this.context.outputLatency || 0;


    const userCompensation = AudioState.userLatencyCompensation / 1000; // convert to seconds

    const autoLatency =
    output > 0 && output < 0.1   // sanity check (<100ms)
      ? base + output
      : base;

    const totalLatency = autoLatency + userCompensation;


    console.log('baseLatency', base);
    console.log('outputLatency', output);
    console.log('userCompensation', userCompensation);
    console.log('totalLatency', totalLatency);

    return {latency:totalLatency, autoLatency:autoLatency, userCompensation:userCompensation};
  }
  
  createRecordingBuffer() {
    if (!this.recordingBuffer || this.recordingBuffer.length === 0) {
      return null;
    }
    
    // Calculate total length
    const totalLength = this.recordingBuffer.reduce((sum, buffer) => sum + buffer.length, 0);
    
    // Create audio buffer with the sample rate from the stream (or default to context sample rate)
    const sampleRate = this.streamSampleRate || this.context.sampleRate;
    const audioBuffer = this.context.createBuffer(
      DAWConfig.audio.channels,
      totalLength,
      sampleRate
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
    
    // Always stop all tracks in the recording stream, regardless of ownership
    // This ensures the browser tab indicator (red dot) is cleared when navigating away
    if (this.recordingStream) {
      this.recordingStream.getTracks().forEach(track => track.stop());
      this.recordingStream = null;
    }
    
    // Remove event listeners
    this.eventBus.off(DAW_EVENTS.PLAYBACK.STARTED, this.handlePlaybackStarted);
    this.eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, this.handleAudioInputDeviceChange);
    if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);
    }
  }
}

export default Recorder; 