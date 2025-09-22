'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '../../../lib/api';
import TagSelector from '../../TagSelector';
import LoadingSpinner from '../../LoadingSpinner';
import { trackTrackUpload, trackCollaboration } from '../../../lib/analytics';
import { FaInfoCircle, FaLock, FaLockOpen, FaExclamationTriangle, FaDownload, FaCut } from 'react-icons/fa';
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
  const [metronomeBpmInput, setMetronomeBpmInput] = useState(metronomeBpm.toString());
  const [timeSignatureInput, setTimeSignatureInput] = useState(timeSignature);
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [enterCompetition, setEnterCompetition] = useState(true); // Default to checked
  const [parentTrackModel, setParentTrackModel] = useState(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const createCompetition = searchParams.get('createCompetition') === 'true';

  const [hasSilenceAtStart, setHasSilenceAtStart] = useState(false);
  const [hasSilenceAtEnd, setHasSilenceAtEnd] = useState(false);
  const [trimSilence, setTrimSilence] = useState(false);
  const [noMetronome, setNoMetronome] = useState(false);


  useEffect(() => {
    if(isCollab || !trackManagerRef.current) return;
    const recordingTrack = trackManagerRef.current.getTrack('recording-track');
    if(recordingTrack) {
      const silenceAtStart = recordingTrack.hasSilenceAtStart();
      const silenceAtEnd = recordingTrack.hasSilenceAtEnd();
      setHasSilenceAtStart(silenceAtStart);
      setHasSilenceAtEnd(silenceAtEnd);
      setTrimSilence(silenceAtStart || silenceAtEnd);
    }
  }, [isCollab]);

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
      buffer = recordingTrack.exportTrack(trimSilence);
      if(!buffer){
        setError('Error exporting recording track');
        return;
      }
    }

    setIsUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('title', title);
      
      // Add audio file or recording buffer
      try {
        const blob = new Blob([buffer], { type: 'audio/wav' });
        formData.append('audio', blob, 'recording.wav');
        
        // Add collab specific data
        if (isCollab) {
          if (parentTrackModel && parentTrackModel.id) {
            formData.append('parent_track_id', parentTrackModel.id);
          }
          else{
            throw new Error('Parent track model not found');
          }
        }
      } catch (audioError) {
        console.error('Error processing audio buffer:', audioError);
        setError('Error processing audio: ' + audioError.message);
        setIsUploading(false);
        return;
      }

      // Collect all track gains from the TrackManager
      const allTracks = trackManagerRef.current.getAllTracks();
      const stemGains = allTracks.map(track => ({
        track_id: track.id === 'recording-track' ? 'recording' : track.id,
        gain: track.gain
      }));

      console.log('Collected stem gains for upload:', stemGains);
      formData.append('stem_gains', JSON.stringify(stemGains));
      
      // Add genre and instrument IDs
      if (selectedGenres.length > 0) {
        formData.append('genreIds', JSON.stringify(selectedGenres));
      }
      if (selectedInstruments.length > 0) {
        formData.append('instrumentIds', JSON.stringify(selectedInstruments));
      }

      if (!isCollab) {
        if (!noMetronome) {
          formData.append('metronome_bpm', metronomeBpm);
          formData.append('time_signature', timeSignature);
          formData.append('metronome_offset', metronomeOffset);
        }
        formData.append('is_private', isPrivate);
      }
      
      // Add download permission for both regular tracks and collaborations
      formData.append('allow_download', allowDownload);

      // Add competition entry preference for collaborations
      if (isCollab && hasActiveCompetition) {
        formData.append('enter_competition', enterCompetition);
      }

      const response = await api.post('/tracks/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      // Get the uploaded track data from the response
      const uploadedTrack = response.data;
      
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
      
      setTimeout(() => {
        if (uploadedTrack && uploadedTrack.id) {
          // If creating competition, redirect to competition create page with track ID
          if (createCompetition) {
            router.push(`/competition/create?track=${uploadedTrack.id}`);
          } else {
            // For new tracks, redirect to the uploaded track page
            router.push(`/track/${uploadedTrack.id}`);
          }
        } else {
          // Fallback to home if track ID is not available
          router.push('/');
        }
      }, 100); // Small timeout to ensure state updates complete before redirect
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
    } finally {
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
        
        {/* Privacy option - only show for non-collab tracks */}
        {!isCollab && (
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

        {/* Trim silence option - only show if track has silence at start or end */}
        {(hasSilenceAtStart || hasSilenceAtEnd) && (
          <div className="flex items-center space-x-2 mt-4">
            <input
              type="checkbox"
              id="trimSilence"
              checked={trimSilence}
              onChange={(e) => setTrimSilence(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="trimSilence" className="flex items-center text-sm">
              <FaCut className="mr-2 text-gray-600" />
              {hasSilenceAtStart && hasSilenceAtEnd 
                ? "Trim silence at start and end"
                : hasSilenceAtStart 
                ? "Trim silence at start"
                : "Trim silence at end"
              }
              {hasSilenceAtStart ? (
                <span className="ml-2 text-xs text-gray-500">(Recommended but might affect grid sync)</span>
              ) : (
                <span className="ml-2 text-xs text-gray-500">(Recommended)</span>
              )}
            </label>
          </div>
        )}

        {/* Download permission - show for both regular tracks and collaborations */}
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
        
        {!allowDownload && (
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
        
        <div className="flex space-x-4">
          {onCancel && (
            <button 
              type="button" 
              onClick={onCancel}
              disabled={isUploading}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          )}
          <button 
            type="submit" 
            disabled={isUploading}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <LoadingSpinner size="small" style={{padding: 0}} />
                Uploading...
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