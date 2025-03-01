'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '../../../lib/api';
import MiniTrack from '../../../components/MiniTrack';
import { Howl } from 'howler';

export default function CollaboratePage() {
  const { trackId } = useParams();
  const router = useRouter();
  const [parentTrack, setParentTrack] = useState(null);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const mediaRecorderRef = useRef(null);
  const parentSoundRef = useRef(null);

  // Fetch parent track
  useEffect(() => {
    const fetchParentTrack = async () => {
      try {
        const response = await api.get(`/tracks/${trackId}`);
        setParentTrack(response.data[0]); // Assuming /:id returns array
      } catch (err) {
        console.error('Failed to fetch parent track:', err);
      }
    };
    fetchParentTrack();
  }, [trackId]);

  // Get audio input devices
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAudioDevices(audioInputs);
        setSelectedDevice(audioInputs[0]?.deviceId || '');
      })
      .catch(err => console.error('Failed to get audio devices:', err));
  }, []);

  // Start recording with parent playback
  const startRecording = async () => {
    if (!selectedDevice) return alert('Please select an audio input device');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedDevice ? { exact: selectedDevice } : undefined },
      });
      mediaRecorderRef.current = new MediaRecorder(stream);
      const chunks = [];

      // Play parent track
      parentSoundRef.current = new Howl({
        src: [parentTrack.audio_url],
        html5: true,
        onend: () => stopRecording(), // Stop when parent ends
      });
      parentSoundRef.current.play();

      // Record
      mediaRecorderRef.current.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) {
      console.error('Recording error:', err);
      alert('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      parentSoundRef.current?.stop();
      setRecording(false);
    }
  };

  // Upload recorded or pre-recorded track
  const handleUpload = async (audioBlob = recordedBlob) => {
    if (!title) return alert('Please enter a title');
    if (!audioBlob && !file) return alert('Please record or select a file');

    const formData = new FormData();
    formData.append('title', title);
    formData.append('parent_track_id', trackId);
    formData.append('audio', audioBlob || file, `${title}.webm`); // Default to .webm for recording

    try {
      await api.post('/tracks/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      router.push('/');
    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload track');
    }
  };

  const downloadParentTrack = () => {
    const link = document.createElement('a');
    link.href = parentTrack.audio_url;
    link.download = `${parentTrack.title}.mp3`;
    link.click();
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Collaborate on Track</h1>
      {parentTrack ? (
        <>
          <MiniTrack track={parentTrack} />
          <div className="mt-4 space-y-6">
            {/* Recording Option */}
            <div className="bg-p1 p-4 rounded">
              <h2 className="text-lg font-semibold mb-2">Record Live</h2>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="w-full p-2 border rounded mb-2"
                disabled={recording}
              >
                {audioDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Mic ${audioDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
              <div className="flex space-x-2">
                <button
                  onClick={startRecording}
                  disabled={recording || !selectedDevice}
                  className={`px-4 py-2 rounded text-white ${
                    recording || !selectedDevice ? 'bg-gray-500' : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  Start Recording
                </button>
                <button
                  onClick={stopRecording}
                  disabled={!recording}
                  className={`px-4 py-2 rounded text-white ${
                    !recording ? 'bg-gray-500' : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  Stop
                </button>
              </div>
              {recordedBlob && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Track Title"
                    className="w-full p-2 border rounded mb-2"
                  />
                  <button
                    onClick={() => handleUpload(recordedBlob)}
                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                  >
                    Upload Recording
                  </button>
                </div>
              )}
            </div>

            {/* Upload Option */}
            <div className="bg-p1 p-4 rounded">
              <h2 className="text-lg font-semibold mb-2">Upload Pre-Recorded</h2>
              <button
                onClick={downloadParentTrack}
                className="bg-blue-500 text-white px-4 py-2 rounded mb-2 hover:bg-blue-600"
              >
                Download Parent Track
              </button>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files[0])}
                className="w-full p-2 border rounded mb-2"
              />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Track Title"
                className="w-full p-2 border rounded mb-2"
              />
              <button
                onClick={() => handleUpload(file)}
                disabled={!file}
                className={`px-4 py-2 rounded text-white ${
                  file ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500'
                }`}
              >
                Upload File
              </button>
            </div>
          </div>
        </>
      ) : (
        <p>Loading parent track...</p>
      )}
    </div>
  );
}