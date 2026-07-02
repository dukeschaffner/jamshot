'use client';

import { useState } from 'react';
import { EllipsisVertical, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useProjectEditor } from '../project/ProjectEditorContext';
import styles from './ProjectTrackActionsMenu.module.css';

type ProjectTrack = {
  id: number | string;
  title?: string | null;
};

type ProjectTrackActionsMenuProps = {
  track: ProjectTrack;
  disabled?: boolean;
};

function getTrackDisplayName(track: ProjectTrack) {
  return track.title?.trim() || `Track ${track.id}`;
}

export default function ProjectTrackActionsMenu({
  track,
  disabled = false,
}: ProjectTrackActionsMenuProps) {
  const { deleteProjectTrack, isTrackMutationPending } = useProjectEditor();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (track.id === 'recording-track') {
    return null;
  }

  const isBusy = disabled || isTrackMutationPending;
  const trackName = getTrackDisplayName(track);

  const handleDeleteSelect = () => {
    setMenuOpen(false);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    await deleteProjectTrack(track.id);
    setDeleteDialogOpen(false);
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={styles.menuButton}
            disabled={isBusy}
            aria-label="Track actions"
          >
            <EllipsisVertical className="size-3.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={handleDeleteSelect}
          >
            <Trash2 className="size-4" />
            Delete track
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete track?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  This will remove <strong>{trackName}</strong> from the project,
                  including any regions on the timeline.
                </p>
                <p className="mt-2">
                  Audio files associated with this track will still be accessible
                  from the Files panel.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTrackMutationPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isTrackMutationPending}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {isTrackMutationPending ? 'Deleting…' : 'Delete track'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
