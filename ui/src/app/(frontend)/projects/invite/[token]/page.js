'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FaExclamationTriangle, FaFolderOpen } from 'react-icons/fa';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useUser } from '@/contexts/UserContext';
import { projectApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import sharedStyles from '@/styles/Dashboard.module.css';

export default function ProjectInvitePage() {
  const router = useRouter();
  const { token } = useParams();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const { isAuthenticated, isLoading: userLoading } = useUser();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (flagsLoading || userLoading) return;

    if (!isFeatureEnabled('projects', false)) {
      setError('Projects are not available');
      setLoading(false);
      return;
    }

    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    if (!token) {
      setError('Invite not found');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadInvite = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await projectApi.getInvite(token);
        if (!cancelled) {
          setInvite(response.data?.invite || null);
        }
      } catch (err) {
        console.error('Failed to load invite:', err);
        if (!cancelled) {
          setError(
            err.response?.data?.error || 'Failed to load invite'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInvite();

    return () => {
      cancelled = true;
    };
  }, [flagsLoading, userLoading, isFeatureEnabled, isAuthenticated, token]);

  const handleAccept = async () => {
    setBusy(true);
    try {
      const response = await projectApi.acceptInvite(token);
      const guid = response.data?.projectGuid;
      if (guid) {
        router.replace(`/projects/${guid}`);
      } else {
        router.replace('/projects');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to accept invite');
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    setBusy(true);
    try {
      await projectApi.declineInvite(token);
      router.replace('/projects');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to decline invite');
      setBusy(false);
    }
  };

  if (flagsLoading || userLoading || loading) {
    return (
      <div className={sharedStyles.container}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirectPath = `/projects/invite/${token}`;
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaFolderOpen className={sharedStyles.errorIcon} />
          <h1>Authentication Required</h1>
          <p>Please log in to view this project invite</p>
          <button
            type="button"
            onClick={() =>
              router.push(`/login?redirect=${encodeURIComponent(redirectPath)}`)
            }
            className={sharedStyles.primaryButton}
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaExclamationTriangle className={sharedStyles.errorIcon} />
          <h1>{error || 'Invite not found'}</h1>
          <Button onClick={() => router.push('/projects')}>
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  const inviterName =
    invite.inviter?.name || invite.inviter?.username || 'Someone';
  const initials = inviterName.slice(0, 2).toUpperCase();

  return (
    <div className={sharedStyles.container}>
      <div className="project-invite-accept-card">
        <Avatar size="lg">
          <AvatarImage
            src={invite.inviter?.profile_pic_url || '/avatar.svg'}
            alt={inviterName}
          />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <h1>{invite.projectName}</h1>
        <p>
          <strong>{inviterName}</strong> invited you to join as{' '}
          <Badge variant="secondary">{invite.role}</Badge>
        </p>
        {invite.alreadyMember ? (
          <>
            <p>You are already a member of this project.</p>
            <Button
              onClick={() => router.push(`/projects/${invite.projectGuid}`)}
            >
              Open project
            </Button>
          </>
        ) : (
          <div className="project-invite-accept-actions">
            <Button onClick={handleAccept} disabled={busy}>
              Accept
            </Button>
            {invite.isTargeted && (
              <Button
                variant="outline"
                onClick={handleDecline}
                disabled={busy}
              >
                Decline
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
