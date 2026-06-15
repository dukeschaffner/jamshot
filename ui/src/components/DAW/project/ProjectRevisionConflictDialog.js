'use client';

import ConfirmationDialog from '@/components/ConfirmationDialog';

export default function ProjectRevisionConflictDialog({
  isOpen,
  onReload,
  onDiscard,
}) {
  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onDiscard}
      onConfirm={onReload}
      title="Project updated elsewhere"
      message="You have unsaved changes that conflict with the latest version. Reload to see the latest work, or discard your unsaved changes."
      confirmText="Reload latest"
      cancelText="Discard my changes"
    />
  );
}
