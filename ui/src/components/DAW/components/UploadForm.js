'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trackApi } from '../../../lib/api';
import TagSelector from '../../TagSelector';
import LoadingSpinner from '../../LoadingSpinner';
import { trackTrackUpload, trackCollaboration } from '../../../lib/analytics';
import { FaInfoCircle, FaLock, FaLockOpen, FaExclamationTriangle, FaDownload, FaCog } from 'react-icons/fa';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import styles from './UploadForm.module.css';
import DAWConfig from '../misc/DAWConfig';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import { useDAW } from '../DAWContext';

export default function UploadForm({
  isCollab = false,
  hasActiveCompetition = false,
  onCancel = null,
  onUploadComplete = null
}) {
  const { metronomeBpm, timeSignature, metronomeOffset, trackManagerRef, trackData } = useDAW();

  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [upgradeLink, setUpgradeLink] = useState('');
  const [limitType, setLimitType] = useState(''); // Track which limit was hit
  const [isUploading, setIsUploading] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const createCompetition = searchParams.get('createCompetition') === 'true';
  const campId = searchParams.get('camp_id');
  const teamId = searchParams.get('team_id');
  const folderId = searchParams.get('folder_id');

  const [metronomeBpmInput, setMetronomeBpmInput] = useState(metronomeBpm.toString());
  const [timeSignatureInput, setTimeSignatureInput] = useState(timeSignature);
  const [isPrivate, setIsPrivate] = useState(!!campId); // Default to true when camp_id is present
  const [allowDownload, setAllowDownload] = useState(true); // Always true for camp uploads
  const [enterCompetition, setEnterCompetition] = useState(true); // Default to checked
  const [parentTrackModel, setParentTrackModel] = useState(null);
  const [processingStatus, setProcessingStatus] = useState(null); // 'processing', 'completed', 'failed'
  const [processingError, setProcessingError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100 for S3 upload progress

  const [noMetronome, setNoMetronome] = useState(false);



  // Generate appropriate upgrade message based on limit type
  const getUpgradeMessage = () => {
    switch (limitType) {
      case 'daily':
        return {
          title: "Reached your daily upload limit?",
          description: "Upgrade your subscription to upload more tracks per day and keep your creative momentum going.",
          buttonText: "Upgrade for More Daily Uploads"
        };
      case 'total':
        return {
          title: "Need more storage for your tracks?",
          description: "Upgrade your subscription to increase your total track limit and keep building your music library.",
          buttonText: "Upgrade for More Storage"
        };
      case 'private':
        return {
          title: "Want to keep your tracks private?",
          description: "Upgrade your subscription to unlock private tracks and control who can listen to your music.",
          buttonText: "Upgrade for Private Tracks"
        };
      default:
        return {
          title: "Want to upload more tracks?",
          description: "Upgrade your subscription to get higher upload limits and unlock more features.",
          buttonText: "View Subscription Plans"
        };
    }
  };

  const setMetronomeBpm = (newBpm) => {
    eventBus.emit(DAW_EVENTS.METRONOME.BPM_CHANGE, { bpm: newBpm });
  };

  const setTimeSignature = (newTimeSignature) => {
    eventBus.emit(DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, { timeSignature: newTimeSignature });
  };

  useEffect(() => {
    setParentTrackModel(trackData[0]);
  }, [trackData]);

  // Sync with parent component when props change
  useEffect(() => {
    setMetronomeBpmInput(metronomeBpm.toString());
  }, [metronomeBpm]);

  useEffect(() => {
    setTimeSignatureInput(timeSignature);
  }, [timeSignature]);

  // Clear error and upgrade link when user starts typing
  useEffect(() => {
    if (error || upgradeLink) {
      setError('');
      setUpgradeLink('');
      setLimitType('');
    }
  }, [title]);

  // Poll processing status
  const pollProcessingStatus = useCallback(async (trackId, trackGuid, startTime = Date.now()) => {
    try {
      // Check if we've exceeded the 5-minute timeout (300,000 ms)
      const elapsedTime = Date.now() - startTime;
      const timeoutMs = 5 * 60 * 1000; // 5 minutes

      if (elapsedTime > timeoutMs) {
        setError('Processing timed out after 5 minutes. Please try again or contact support if the issue persists.');
        setProcessingStatus('failed');
        setIsUploading(false);
        return;
      }

      const response = await trackApi.getProcessingStatus(trackId);
      const status = response.data;

      setProcessingStatus(status.status);
      setProcessingError(status.error);

      if (status.status === 'completed') {
        // Processing is done, redirect using GUID for public-facing URLs
        setTimeout(() => {
          if (campId) {
            router.push(`/camp/${campId}`);
          } else if (teamId) {
            router.push(`/team/${teamId}`);
          } else if (createCompetition) {
            router.push(`/competition/create?track=${trackId}`);
          } else {
            router.push(`/track/${trackGuid}`);
          }
        }, 100);
      } else if (status.status === 'failed') {
        // Processing failed, show error
        setError(`Processing failed: ${status.error || 'Unknown error'}`);
        setIsUploading(false);
      } else {
        // Still processing, poll again in 3 seconds
        setTimeout(() => pollProcessingStatus(trackId, trackGuid, startTime), 3000);
      }
    } catch (err) {
      console.error('Error polling processing status:', err);
      setError('Failed to check processing status');
      setIsUploading(false);
    }
  }, [createCompetition, teamId, campId, router]);

  // Upload file directly to S3
  const uploadToS3 = async (uploadUrl, file) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('S3 upload failed'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'audio/wav');
      xhr.send(file);
    });
  };

  // Time signature options
  const timeSignatureOptions = DAWConfig.timeSignature.options;

  const handleTagChange = ({ genreIds, instrumentIds }) => {
    setSelectedGenres(genreIds);
    setSelectedInstruments(instrumentIds);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let buffer = null;

    const recordingTrack = trackManagerRef.current.getTrack('recording-track');
    if (!recordingTrack) {
      setError('No recording track found');
      return;
    }
    else{
      buffer = recordingTrack.exportTrack(true);
      if(!buffer){
        setError('Error exporting recording track');
        return;
      }
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);
    setProcessingStatus(null);
    setProcessingError(null);

    try {
      // Phase 1: Initialize upload to get pre-signed S3 URL
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const filename = 'recording.wav';

      const initResponse = await trackApi.initUpload(filename, blob.size, !!campId, teamId ? parseInt(teamId) : null);
      const { uploadUrl, key: s3Key } = initResponse.data;

      console.log('Upload initialized, S3 key:', s3Key);

      // Phase 2: Upload directly to S3
      console.log('Uploading to S3...');
      await uploadToS3(uploadUrl, blob);
      setUploadProgress(100);
      console.log('S3 upload completed');

      // Phase 3: Process upload - create database record and trigger audio processing
      const stems = trackManagerRef.current.getAllTracks().map(track => {
        const stemData = {
          track_id: track.id === 'recording-track' ? 'recording' : track.id,
          gain: track.gain
        };
        
        // For non-recording tracks (parent stems), save all region information 
        // (startTime, endTime, offset) so regions can be reconstructed when the collab track is opened
        if (track.id !== 'recording-track') {
          const regionsForUpload = track.getRegionsForUpload();
          if (regionsForUpload.length > 0) {
            stemData.regions = regionsForUpload;
          }
        }
        
        return stemData;
      });
      
      const uploadData = {
        title,
        s3Key,
        stems: JSON.stringify(stems),
        genreIds: selectedGenres.length > 0 ? JSON.stringify(selectedGenres) : undefined,
        instrumentIds: selectedInstruments.length > 0 ? JSON.stringify(selectedInstruments) : undefined,
        allow_download: allowDownload
      };

      // Add camp_id if present (for camp uploads)
      if (campId) {
        uploadData.camp_id = parseInt(campId);
      }
      else if (teamId) {
        uploadData.team_id = parseInt(teamId);
      }

      // Add folder_id if present
      if (folderId) {
        uploadData.folder_id = parseInt(folderId);
      }

      // Add collab specific data
      if (isCollab) {
        if (parentTrackModel && parentTrackModel.id) {
          uploadData.parent_track_id = parentTrackModel.id;
        } else {
          throw new Error('Parent track model not found');
        }
        if (hasActiveCompetition) {
          uploadData.enter_competition = enterCompetition;
        }
      } else {
        // Only add these for non-collaborations
        if (!noMetronome) {
          uploadData.metronome_bpm = metronomeBpm;
          uploadData.time_signature = timeSignature;
          uploadData.metronome_offset = metronomeOffset;
        }
        uploadData.is_private = isPrivate;
      }

      console.log('Processing upload with data:', uploadData);
      const processResponse = await trackApi.processUpload(uploadData);
      const uploadedTrack = processResponse.data;

      console.log('Upload processed, track created:', uploadedTrack);

      // Track analytics event
      if (isCollab) {
        trackCollaboration(uploadedTrack.id, uploadedTrack.title);
      } else {
        trackTrackUpload(uploadedTrack.title);
      }

      // Notify parent component that upload is complete
      if (onUploadComplete) {
        onUploadComplete();
      }

      // Start polling for processing status
      setProcessingStatus('processing');
      pollProcessingStatus(uploadedTrack.id, uploadedTrack.guid);

    } catch (err) {
      console.error('Upload error:', err);

      // Check if the error response contains an upgrade link
      const errorData = err.response?.data;
      if (errorData?.upgrade_link) {
        setUpgradeLink(errorData.upgrade_link);

        // Determine the type of limit based on the error message
        if (errorData.error?.includes('Daily upload limit reached')) {
          setLimitType('daily');
        } else if (errorData.error?.includes('Total track limit reached')) {
          setLimitType('total');
        } else if (errorData.error?.includes('Private tracks are not allowed')) {
          setLimitType('private');
        } else {
          setLimitType('general');
        }
      } else {
        setUpgradeLink('');
        setLimitType('');
      }

      setError(errorData?.error || 'Upload failed: ' + (err.message || 'Unknown error'));
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">
        {isCollab ? 'Publish your collaboration' : 'Publish your track'}
      </h1>
      
      {/* Add privacy warning for collaborations */}
      {isCollab && parentTrackModel?.is_private && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-300 rounded-md">
          <div className="flex items-start">
            <FaExclamationTriangle className="text-yellow-500 mt-1 mr-3 flex-shrink-0" size={20} />
            <div>
              <h3 className="font-semibold mb-2">Privacy Notice for Collaborations</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                <li>
                  <FaLock className="inline mr-1" /> This collaboration will be <strong>private</strong> because the original track is private.
                </li>
                <li>If the original track&apos;s privacy status changes from private to public, your collaboration will also become public.</li>
                <li>You will have <strong>no control</strong> over the privacy status of your collaboration.</li>
                <li>All collaborations on the same track will share the same privacy status and access keys.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">Caption</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a caption for your track"
            className="w-full p-2 border rounded"
            required
          />
        </div>
        
        {!isCollab && (
          <>
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="checkbox"
                  id="noMetronome"
                  checked={noMetronome}
                  onChange={(e) => setNoMetronome(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="noMetronome" className="text-sm font-medium">
                  My recording doesn&apos;t use the metronome
                </label>
              </div>
              
              {!noMetronome && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="metronome" className="block text-sm font-medium mb-1">Metronome (BPM)</label>
                    <input
                      id="metronome"
                      type="number"
                      min="40"
                      max="240"
                      value={metronomeBpmInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMetronomeBpmInput(value);
                        
                        // Update parent component BPM if valid
                        const newBpm = parseInt(value, 10);
                        if (!isNaN(newBpm) && newBpm >= 40 && newBpm <= 240 && setMetronomeBpm) {
                          setMetronomeBpm(newBpm);
                        }
                      }}
                      placeholder={parentTrackModel?.metronome_bpm || "e.g., 120"}
                      className="w-full p-2 border rounded"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="timeSignature" className="block text-sm font-medium mb-1">Time Signature</label>
                    <select
                      id="timeSignature"
                      value={timeSignatureInput}
                      onChange={(e) => {
                        const newTimeSignature = e.target.value;
                        setTimeSignatureInput(newTimeSignature);
                        
                        // Update parent component time signature if callback exists
                        if (setTimeSignature) {
                          setTimeSignature(newTimeSignature);
                        }
                      }}
                      className="w-full p-2 border rounded"
                    >
                      {timeSignatureOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        
        <div>
          <label className="block text-sm font-medium mb-2">Tags</label>
          <TagSelector 
            selectedGenres={selectedGenres}
            selectedInstruments={selectedInstruments}
            onChange={handleTagChange}
            maxGenres={2}
            maxInstruments={4}
          />
        </div>
        
        {/* Privacy option - only show for non-collab tracks and when not uploading to a camp */}
        {!isCollab && !campId && !teamId && (
          <>
            <div className="flex items-center space-x-2 mt-4">
              <input
                type="checkbox"
                id="isPrivate"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="isPrivate" className="flex items-center text-sm">
                <FontAwesomeIcon icon={faLock} className="mr-2 text-gray-600" />
                Make this track private
                <span className="ml-2 text-xs text-gray-500">(Only you will be able to see it)</span>
              </label>
            </div>

            {isPrivate && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded flex items-start">
                <FaInfoCircle className="text-blue-500 mt-1 mr-2 flex-shrink-0" />
                <p className="text-sm text-gray-700">
                  <strong>Note:</strong> If you make this track public later and it has collaborations, all collaborations will also become public. Once your track has collaborations, you cannot make it private again.
                </p>
              </div>
            )}
          </>
        )}

        {/* Download permission - show for both regular tracks and collaborations, but not for camp uploads */}
        {!campId && (
          <div className="flex items-center space-x-2 mt-4">
            <input
              type="checkbox"
              id="allowDownload"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="allowDownload" className="flex items-center text-sm">
              <FaDownload className="mr-2 text-gray-600" />
              Allow users to download this audio file
              <span className="ml-2 text-xs text-gray-500">(Recommended for sharing)</span>
            </label>
          </div>
        )}

        {/* Competition entry - only show for collaborations with active competition */}
        {isCollab && hasActiveCompetition && (
          <div className="flex items-center space-x-2 mt-4">
            <input
              type="checkbox"
              id="enterCompetition"
              checked={enterCompetition}
              onChange={(e) => setEnterCompetition(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="enterCompetition" className="flex items-center text-sm">
              <span className="mr-2 text-gray-600">🏆</span>
              Enter this track in the active competition
              <span className="ml-2 text-xs text-gray-500">(Win prizes and get exposure!)</span>
            </label>
          </div>
        )}

        {!allowDownload && !campId && (
          <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded flex items-start">
            <FaInfoCircle className="text-green-500 mt-1 mr-2 flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>Tip:</strong> Allowing downloads helps other musicians collaborate with your track and gives you more exposure in the community.
            </p>
          </div>
        )}

        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded flex items-start">
          <FaInfoCircle className="text-blue-500 mt-1 mr-2 flex-shrink-0" />
          <p className="text-sm text-gray-700">
            <strong>Note:</strong> By uploading, you confirm you own this content and grant others the right to remix and collaborate per our <a href="/terms" className="terms-link">Terms of Service</a>.
          </p>
        </div>
      
        
        {error && (
          <div className="text-red-500">
            <p>{error}</p>
            {upgradeLink && (
              <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800 font-medium mb-2">
                  {getUpgradeMessage().title}
                </p>
                <p className="text-blue-700 text-sm mb-3">
                  {getUpgradeMessage().description}
                </p>
                <button
                  type="button"
                  onClick={() => window.open(upgradeLink, '_blank')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors duration-200"
                >
                  {getUpgradeMessage().buttonText}
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Processing Status Display */}
        {processingStatus && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-3">
              <FaCog className={`text-blue-500 ${processingStatus === 'processing' ? 'animate-spin' : ''}`} />
              <div className="flex-1">
                <h3 className="font-medium text-blue-800">
                  {processingStatus === 'processing' && 'Processing your audio...'}
                  {processingStatus === 'completed' && 'Processing completed!'}
                  {processingStatus === 'failed' && 'Processing failed'}
                </h3>
                {processingStatus === 'processing' && (
                  <p className="text-sm text-blue-600 mt-1">
                    This may take a few minutes. We&apos;ll redirect you when it&apos;s ready.
                  </p>
                )}
                {processingStatus === 'failed' && processingError && (
                  <p className="text-sm text-red-600 mt-1">
                    Error: {processingError}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Upload Progress Display */}
        {isUploading && uploadProgress > 0 && uploadProgress < 100 && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center space-x-3">
              <LoadingSpinner size="small" />
              <div className="flex-1">
                <h3 className="font-medium text-gray-800">Uploading to server...</h3>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-1">{Math.round(uploadProgress)}% complete</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex space-x-4">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isUploading || processingStatus === 'processing'}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isUploading || processingStatus === 'processing'}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading && uploadProgress < 100 ? (
              <>
                <LoadingSpinner size="small" style={{padding: 0}} />
                Uploading...
              </>
            ) : processingStatus === 'processing' ? (
              <>
                <FaCog className="animate-spin" />
                Processing...
              </>
            ) : (
              'Upload'
            )}
          </button>
        </div>
      </form>
    </div>
  );
} 