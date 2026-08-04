'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useUser } from '@/contexts/UserContext';
import {
  FaFolderOpen,
  FaClock,
  FaExclamationTriangle,
  FaUsers,
  FaCampground,
  FaMusic,
} from 'react-icons/fa';
import { projectApi, teamApi, campApi, trackApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import sharedStyles from '@/styles/SharedForm.module.css';
import styles from './ProjectCreate.module.css';

function parseContextId(value) {
  if (value == null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function CreateProjectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const { isAuthenticated, isLoading: userLoading } = useUser();

  const queryTeamId = parseContextId(searchParams.get('team_id'));
  const queryCampId = parseContextId(searchParams.get('camp_id'));
  const sourceTrackGuid = searchParams.get('track_id');
  const hasInvalidQueryContext = searchParams.get('team_id') && queryTeamId == null
    || searchParams.get('camp_id') && queryCampId == null
    || (queryTeamId != null && queryCampId != null);

  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState(queryTeamId);
  const [campId, setCampId] = useState(queryCampId);
  const [scopeLockedFromTrack, setScopeLockedFromTrack] = useState(false);
  const [contextLabel, setContextLabel] = useState('');
  const [sourceTrackLabel, setSourceTrackLabel] = useState('');
  const [sourceTrackReady, setSourceTrackReady] = useState(!sourceTrackGuid);
  const [sourceTrackError, setSourceTrackError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showUpgradeLink, setShowUpgradeLink] = useState(false);

  // Keep query-param scope in sync when navigating without a source track
  useEffect(() => {
    if (scopeLockedFromTrack) return;
    setTeamId(queryTeamId);
    setCampId(queryCampId);
  }, [queryTeamId, queryCampId, scopeLockedFromTrack]);

  const hasInvalidContext = (teamId != null && campId != null)
    || (!scopeLockedFromTrack && hasInvalidQueryContext);

  useEffect(() => {
    if (teamId == null && campId == null) {
      setContextLabel('');
      return;
    }

    let cancelled = false;

    const loadContext = async () => {
      try {
        if (teamId != null) {
          const response = await teamApi.getTeam(teamId);
          if (!cancelled) {
            setContextLabel(response.data?.name ? `Team: ${response.data.name}` : 'Team project');
          }
          return;
        }

        if (campId != null) {
          const response = await campApi.getCamp(campId);
          if (!cancelled) {
            setContextLabel(response.data?.name ? `Camp: ${response.data.name}` : 'Camp project');
          }
        }
      } catch (err) {
        console.error('Error loading project context:', err);
        if (!cancelled) {
          setContextLabel(teamId != null ? 'Team project' : 'Camp project');
        }
      }
    };

    loadContext();

    return () => {
      cancelled = true;
    };
  }, [teamId, campId]);

  useEffect(() => {
    if (!sourceTrackGuid) {
      setSourceTrackLabel('');
      setSourceTrackError('');
      setSourceTrackReady(true);
      setScopeLockedFromTrack(false);
      return;
    }

    let cancelled = false;
    setSourceTrackReady(false);
    setSourceTrackError('');

    const loadTrack = async () => {
      try {
        const response = await trackApi.getTrack(sourceTrackGuid);
        // getTrack returns an array (track + versions); prefer matching guid
        const tracks = Array.isArray(response.data) ? response.data : [response.data];
        const track =
          tracks.find((t) => t?.guid === sourceTrackGuid) || tracks[0] || null;
        if (cancelled) return;

        if (!track) {
          setSourceTrackError('Track not found');
          setSourceTrackReady(true);
          return;
        }

        const title = track.title || 'Untitled track';
        const artist =
          track.username || track.artist?.username || 'Unknown artist';
        setSourceTrackLabel(`${title} by ${artist}`);
        setName((current) => (current.trim() ? current : `${title} project`));

        // Lock project scope to the source track's camp/team
        const trackCampId = parseContextId(track.camp_id);
        const trackTeamId = parseContextId(track.team_id);
        if (trackCampId != null) {
          setCampId(trackCampId);
          setTeamId(null);
          setScopeLockedFromTrack(true);
        } else if (trackTeamId != null) {
          setTeamId(trackTeamId);
          setCampId(null);
          setScopeLockedFromTrack(true);
        } else {
          setScopeLockedFromTrack(false);
        }

        setSourceTrackReady(true);
      } catch (err) {
        console.error('Error loading source track:', err);
        if (!cancelled) {
          setSourceTrackError(
            err.response?.data?.error || 'Could not load the track to create a project from'
          );
          setSourceTrackReady(true);
        }
      }
    };

    loadTrack();

    return () => {
      cancelled = true;
    };
    // Only re-fetch when track_id changes; don't reset name on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTrackGuid]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setShowUpgradeLink(false);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Project name is required');
      setIsSubmitting(false);
      return;
    }

    if (hasInvalidContext) {
      setError('Invalid team or camp context');
      setIsSubmitting(false);
      return;
    }

    if (sourceTrackGuid && sourceTrackError) {
      setError(sourceTrackError);
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = { name: trimmedName };
      if (teamId != null) payload.team_id = teamId;
      if (campId != null) payload.camp_id = campId;
      if (sourceTrackGuid) payload.source_track_id = sourceTrackGuid;

      const response = await projectApi.createProject(payload);
      const projectGuid = response.data?.guid;

      if (!projectGuid) {
        throw new Error('Project created but no id returned');
      }

      router.push(`/projects/${projectGuid}`);
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err.response?.data?.error || err.message || 'Failed to create project. Please try again.');
      setShowUpgradeLink(Boolean(err.response?.data?.upgrade_link));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (flagsLoading || userLoading) {
    return (
      <div className={styles.projectCreateContainer}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isFeatureEnabled('projects', false)) {
    notFound();
  }

  if (!isAuthenticated) {
    const redirectParams = new URLSearchParams();
    if (teamId != null) redirectParams.set('team_id', String(teamId));
    if (campId != null) redirectParams.set('camp_id', String(campId));
    if (sourceTrackGuid) redirectParams.set('track_id', sourceTrackGuid);
    const qs = redirectParams.toString();
    const redirectPath = qs ? `/projects/create?${qs}` : '/projects/create';

    return (
      <div className={styles.projectCreateContainer}>
        <div className={sharedStyles.authRequired}>
          <FaFolderOpen className={sharedStyles.authIcon} />
          <h1>Login Required</h1>
          <p>You need to be logged in to create a project.</p>
          <button
            type="button"
            onClick={() => router.push(`/login?redirect=${encodeURIComponent(redirectPath)}`)}
            className={sharedStyles.loginButton}
          >
            Login to Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.projectCreateContainer}>
      <div className={sharedStyles.formContainer}>
        <div className={sharedStyles.formHeader}>
          <FaFolderOpen className={sharedStyles.formHeaderIcon} />
          <h1>Create Project</h1>
          <p>
            {sourceTrackGuid
              ? 'Start a browser DAW session from this track'
              : 'Start a new browser DAW session'}
          </p>
        </div>

        {contextLabel && (
          <div className={styles.contextBanner}>
            {teamId != null ? <FaUsers /> : <FaCampground />}
            <span>
              {scopeLockedFromTrack ? (
                <>
                  This project will be created in <strong>{contextLabel}</strong>
                  {' '}(same as the source track)
                </>
              ) : (
                <>
                  Creating for <strong>{contextLabel}</strong>
                </>
              )}
            </span>
          </div>
        )}

        {sourceTrackGuid && (
          <div className={styles.contextBanner}>
            <FaMusic />
            <span>
              {sourceTrackReady ? (
                sourceTrackError ? (
                  sourceTrackError
                ) : (
                  <>
                    Creating from <strong>{sourceTrackLabel}</strong>
                  </>
                )
              ) : (
                'Loading track…'
              )}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={sharedStyles.form}>
          <div className={sharedStyles.formSection}>
            <h3>
              <FaFolderOpen />
              Project Details
            </h3>

            <div className={sharedStyles.formGroup}>
              <label htmlFor="name" className={sharedStyles.formLabel}>
                Project Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) {
                    setError('');
                    setShowUpgradeLink(false);
                  }
                }}
                className={sharedStyles.formInput}
                placeholder="e.g., Summer Demo Arrangement"
                maxLength={200}
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className={showUpgradeLink ? styles.limitMessage : sharedStyles.message}>
              <FaExclamationTriangle
                className={showUpgradeLink ? styles.limitMessageIcon : sharedStyles.messageIcon}
              />
              <span>
                {error}
                {showUpgradeLink && (
                  <>
                    {' '}
                    <Link href="/subscribe" className={styles.upgradeLink}>
                      Upgrade your subscription
                    </Link>
                    {' to get more projects.'}
                  </>
                )}
              </span>
            </div>
          )}

          <div className={sharedStyles.formActions}>
            <button
              type="button"
              onClick={() => router.back()}
              className={sharedStyles.cancelButton}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={sharedStyles.submitButton}
              disabled={
                isSubmitting
                || !name.trim()
                || hasInvalidContext
                || Boolean(sourceTrackGuid && (!sourceTrackReady || sourceTrackError))
              }
            >
              {isSubmitting ? (
                <>
                  <FaClock className={sharedStyles.loadingIcon} />
                  {sourceTrackGuid ? 'Creating & importing…' : 'Creating Project...'}
                </>
              ) : (
                <>
                  <FaFolderOpen />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CreateProjectPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.projectCreateContainer}>
          <LoadingSpinner />
        </div>
      }
    >
      <CreateProjectClient />
    </Suspense>
  );
}
