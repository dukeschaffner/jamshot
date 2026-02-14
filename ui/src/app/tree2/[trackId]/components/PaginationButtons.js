'use client';

import styles from './PaginationButtons.module.css';

/**
 * PaginationButtons Component
 * Displays prev/next buttons for navigating through paginated children in concentric tree view
 */
export default function PaginationButtons({
  parentTrackId,
  treeDataManager,
  viewState,
  onPageChange
}) {
  if (!parentTrackId || !treeDataManager || !viewState) {
    return null;
  }

  const uiPagination = viewState.paginationByParent.get(parentTrackId);
  if (!uiPagination) {
    return null;
  }

  const apiPagination = treeDataManager.paginationData.get(parentTrackId);
  if (!apiPagination) {
    return null;
  }

  const { page: currentPage, pageSize } = uiPagination;
  const totalPages = apiPagination.pages || 1;
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  if (!hasPrevious && !hasNext) {
    return null;
  }

  return (
    <div className={styles['pagination-container']}>
      <button
        className={styles['pagination-button']}
        disabled={!hasPrevious}
        onClick={() => hasPrevious && onPageChange(parentTrackId, currentPage - 1)}
        aria-label="Previous page"
      >
        Previous
      </button>
      <span className={styles['pagination-info']}>
        Page {currentPage} of {totalPages}
      </span>
      <button
        className={styles['pagination-button']}
        disabled={!hasNext}
        onClick={() => hasNext && onPageChange(parentTrackId, currentPage + 1)}
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
}

