'use client';

import { useCallback, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { MAX_PROJECT_TRACKS } from '@sterio/subscription-utils';
import TrackHeader from '../components/TrackHeader';
import { useProjectEditor } from './ProjectEditorContext';
import styles from '../DAW.module.css';
import listStyles from './ProjectTrackHeadersList.module.css';

export default function ProjectTrackHeadersList({ tracks }) {
  const {
    canEdit: canEditProject,
    isAtTrackLimit,
    isTrackMutationPending,
    addProjectTrack,
    reorderProjectTracks,
  } = useProjectEditor();

  const [dragTrackId, setDragTrackId] = useState(null);
  const [dragOverTrackId, setDragOverTrackId] = useState(null);

  const canReorder = canEditProject && tracks.length > 1;

  const clearDragState = useCallback(() => {
    setDragTrackId(null);
    setDragOverTrackId(null);
  }, []);

  const handleDragStart = useCallback(
    (trackId) => {
      if (!canReorder || isTrackMutationPending) return;
      setDragTrackId(trackId);
    },
    [canReorder, isTrackMutationPending]
  );

  const handleDragOver = useCallback(
    (event, trackId) => {
      if (!canReorder || !dragTrackId || dragTrackId === trackId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverTrackId(trackId);
    },
    [canReorder, dragTrackId]
  );

  const handleDrop = useCallback(
    async (event, targetTrackId) => {
      event.preventDefault();
      if (!canReorder || !dragTrackId || dragTrackId === targetTrackId) {
        clearDragState();
        return;
      }

      const currentIds = tracks.map((track) => track.id);
      const fromIndex = currentIds.indexOf(dragTrackId);
      const toIndex = currentIds.indexOf(targetTrackId);
      clearDragState();

      if (fromIndex === -1 || toIndex === -1) return;

      const nextIds = [...currentIds];
      nextIds.splice(fromIndex, 1);
      nextIds.splice(toIndex, 0, dragTrackId);
      await reorderProjectTracks(nextIds);
    },
    [canReorder, clearDragState, dragTrackId, reorderProjectTracks, tracks]
  );

  return (
    <div className={styles.tracksHeaders}>
      {tracks.map((track) => {
        const isDragging = dragTrackId === track.id;
        const isDragOver = dragOverTrackId === track.id;

        return (
          <div
            key={track.id}
            className={`${listStyles.trackHeaderRow} ${isDragging ? listStyles.dragging : ''} ${isDragOver ? listStyles.dragOver : ''}`}
            onDragOver={(event) => handleDragOver(event, track.id)}
            onDrop={(event) => handleDrop(event, track.id)}
            onDragLeave={() => {
              if (dragOverTrackId === track.id) {
                setDragOverTrackId(null);
              }
            }}
          >
            <TrackHeader
              track={track}
              canReorder={canReorder}
              isTrackMutationPending={isTrackMutationPending}
              onDragStart={handleDragStart}
              onDragEnd={clearDragState}
            />
          </div>
        );
      })}

      {canEditProject && (
        <div className={styles.addTrackRow}>
          <button
            type="button"
            className={styles.addTrackButton}
            onClick={addProjectTrack}
            disabled={isAtTrackLimit || isTrackMutationPending}
            aria-label="Add track"
            title={
              isAtTrackLimit
                ? `Track limit reached (${MAX_PROJECT_TRACKS})`
                : 'Add track'
            }
          >
            <FontAwesomeIcon icon={faPlus} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
