"use client";

import { useState, useEffect, useRef } from 'react';

export default function AudioRecorder() {
  const [audioContext, setAudioContext] = useState(null);
  const [status, setStatus] = useState('Select an audio file to play along with your recording');
  const [isRecording, setIsRecording] = useState(false);
  const [canRecord, setCanRecord] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [inputLatency, setInputLatency] = useState(200); // Default latency compensation in ms
  
  // Refs to store audio objects and data
  const playbackTrackRef = useRef(null);
  const recordedBufferRef = useRef(null);
  const micStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const playbackSourceRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const isRecordingRef = useRef(false);

  // Initialize the audio context
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        setAudioContext(new AudioContext());
      } catch (e) {
        setStatus('Web Audio API is not supported in this browser');
        console.error('Web Audio API error:', e);
      }
    }
    
    // Cleanup function
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Sync the isRecording ref with the state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Load the selected audio file
  const loadAudioFile = async (e) => {
    if (!audioContext) return;
    
    const file = e.target.files[0];
    if (!file) return;
    
    setStatus('Loading audio file...');
    setCanRecord(false);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decodedData = await audioContext.decodeAudioData(arrayBuffer);
      playbackTrackRef.current = decodedData;
      
      setStatus(`Loaded: ${file.name} (${Math.round(decodedData.duration * 10) / 10}s)`);
      setCanRecord(true);
    } catch (e) {
      setStatus('Error loading audio file');
      console.error('Error loading audio file:', e);
    }
  };

  // Start recording with playback
  const startRecording = async () => {
    if (isRecording || !audioContext || !playbackTrackRef.current) return;
    
    try {
      // Resume the audio context if it's suspended (important for Chrome)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      
      // Create the recorder nodes
      const micSource = audioContext.createMediaStreamSource(stream);
      
      // Create a processor for recording the microphone
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      
      // Create an array to store the recorded data
      const recordedData = [];
      
      // Set up the recording processor - using the ref instead of state
      processorNode.onaudioprocess = function(e) {
        if (isRecordingRef.current) {
          const inputBuffer = e.inputBuffer;
          const channelData = inputBuffer.getChannelData(0);
          const bufferCopy = new Float32Array(channelData.length);
          bufferCopy.set(channelData);
          recordedData.push(bufferCopy);
        }
      };
      
      // Connect the microphone to the processor and the processor to the destination
      micSource.connect(processorNode);
      processorNode.connect(audioContext.destination);
      
      // Store the recorder components for later use
      recorderRef.current = {
        processorNode,
        recordedData
      };
      
      // Start playing the backing track
      const playbackSource = audioContext.createBufferSource();
      playbackSource.buffer = playbackTrackRef.current;
      playbackSource.connect(audioContext.destination);
      playbackSource.start();
      playbackSourceRef.current = playbackSource;
      
      // Track start time for synchronization
      recordingStartTimeRef.current = audioContext.currentTime;
      
      // Update UI and recording state
      setIsRecording(true);
      isRecordingRef.current = true;
      setCanPlay(false);
      setStatus('Recording with playback...');
    } catch (e) {
      setStatus('Error accessing microphone: ' + e.message);
      console.error('Recording error:', e);
    }
  };

  // Stop recording and prepare the recorded audio
  const stopRecording = () => {
    if (!isRecording || !audioContext) return;
    
    // Update recording state first to stop collecting data
    setIsRecording(false);
    isRecordingRef.current = false;
    
    // Stop the playback
    if (playbackSourceRef.current) {
      try {
        playbackSourceRef.current.stop();
      } catch (e) {
        console.error('Error stopping playback source:', e);
      }
      playbackSourceRef.current = null;
    }
    
    // Stop the recording
    if (recorderRef.current && recorderRef.current.processorNode) {
      try {
        recorderRef.current.processorNode.disconnect();
      } catch (e) {
        console.error('Error disconnecting processor node:', e);
      }
    }
    
    // Stop the microphone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    
    // Create a buffer from the recorded data
    if (recorderRef.current && recorderRef.current.recordedData && recorderRef.current.recordedData.length > 0) {
      const recordedData = recorderRef.current.recordedData;
      console.log(`Recorded ${recordedData.length} chunks of audio data`);
      
      const recordedLength = recordedData.reduce((acc, buffer) => acc + buffer.length, 0);
      console.log(`Total recorded samples: ${recordedLength}`);
      
      const mergedBuffer = new Float32Array(recordedLength);
      
      let offset = 0;
      for (const buffer of recordedData) {
        mergedBuffer.set(buffer, offset);
        offset += buffer.length;
      }
      
      // Create an AudioBuffer with the same duration as the recording
      const recordedBuffer = audioContext.createBuffer(
        1,
        mergedBuffer.length,
        audioContext.sampleRate
      );
      
      // Fill the buffer with the recorded data
      recordedBuffer.getChannelData(0).set(mergedBuffer);
      recordedBufferRef.current = recordedBuffer;
      
      setStatus(`Recording complete (${Math.round(recordedBuffer.duration * 10) / 10}s)`);
      setCanPlay(true);
    } else {
      console.error('No recorded data available', recorderRef.current);
      setStatus('No audio recorded - Please check browser console for details');
    }
  };

  // Play back the recorded audio synchronized with the original track
  const playResult = () => {
    if (!recordedBufferRef.current || !playbackTrackRef.current || !audioContext) {
      setStatus('No recording or playback track available');
      return;
    }
    
    // Resume context if needed
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Create source nodes for both tracks
    const recordedSource = audioContext.createBufferSource();
    recordedSource.buffer = recordedBufferRef.current;
    
    const trackSource = audioContext.createBufferSource();
    trackSource.buffer = playbackTrackRef.current;
    
    // Create gain nodes for volume control
    const recordedGain = audioContext.createGain();
    recordedGain.gain.value = 0.8; // Set volume for recorded audio
    
    const trackGain = audioContext.createGain();
    trackGain.gain.value = 1.0; // Set volume for backing track
    
    // Connect the sources through the gain nodes to the destination
    recordedSource.connect(recordedGain);
    trackSource.connect(trackGain);
    
    recordedGain.connect(audioContext.destination);
    trackGain.connect(audioContext.destination);
    
    // Calculate the latency offset in seconds
    const latencyOffset = inputLatency / 1000; // Convert ms to seconds
    
    // Start playback with latency compensation
    const currentTime = audioContext.currentTime;
    trackSource.start(currentTime);
    recordedSource.start(currentTime - latencyOffset); // Start recorded audio earlier to compensate
    
    setStatus('Playing synchronized audio...');
    setCanPlay(false);
    
    // Enable the play button when playback is complete
    trackSource.onended = function() {
      setStatus('Playback complete');
      setCanPlay(true);
    };
  };

  // Update the latency compensation value
  const updateLatency = (e) => {
    setInputLatency(parseInt(e.target.value));
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-center">Audio Recording with Playback</h1>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select backing track:
          </label>
          <input 
            type="file" 
            accept="audio/*" 
            onChange={loadAudioFile}
            className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Input Latency Compensation (ms): {inputLatency}
          </label>
          <input
            type="range"
            min="0"
            max="500"
            step="10"
            value={inputLatency}
            onChange={updateLatency}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0ms</span>
            <span>250ms</span>
            <span>500ms</span>
          </div>
        </div>
        
        <div className="flex space-x-2 mb-6">
          <button
            onClick={startRecording}
            disabled={!canRecord || isRecording}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Recording
          </button>
          
          <button
            onClick={stopRecording}
            disabled={!isRecording}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Stop
          </button>
          
          <button
            onClick={playResult}
            disabled={!canPlay}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Play Result
          </button>
        </div>
        
        <div className="p-3 bg-gray-50 rounded-md text-sm text-gray-700">
          {status}
        </div>
      </div>
    </div>
  );
}