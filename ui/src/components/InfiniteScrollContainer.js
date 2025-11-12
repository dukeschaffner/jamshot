'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import LoadingSpinner from './LoadingSpinner';

/**
 * InfiniteScrollContainer - A reusable component for infinite scroll pagination
 * 
 * @param {Function} fetchData - Async function that fetches data for a given page
 *   Should return: { items: Array, pagination: { hasMore: boolean, page: number, total?: number } }
 *   Signature: (page: number) => Promise<{ items: Array, pagination: Object }>
 * @param {Function} renderItem - Function to render each item
 *   Signature: (item: any, index: number, items: Array) => ReactNode
 * @param {ReactNode} emptyState - Component to show when there are no items
 * @param {ReactNode} errorState - Component to show on error (receives error message)
 * @param {string} className - CSS class for the container
 * @param {string} itemClassName - CSS class for each item wrapper
 * @param {number} itemsPerPage - Number of items per page (default: 5)
 * @param {Array} dependencies - Array of dependencies that should trigger a reset (like entity IDs)
 * @param {Function} onLoadMore - Optional callback when more items are loaded
 * @param {boolean} resetOnDependenciesChange - Whether to reset when dependencies change (default: true)
 */
export default function InfiniteScrollContainer({
  fetchData,
  renderItem,
  emptyState = null,
  errorState = null,
  className = '',
  itemClassName = '',
  itemsPerPage = 5,
  dependencies = [],
  onLoadMore = null,
  resetOnDependenciesChange = true,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const observer = useRef();

  const lastElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  const fetchItems = useCallback(async (pageNum) => {
    try {
      setLoading(true);
      setError('');
      
      const result = await fetchData(pageNum);
      
      // Handle both direct array responses and object responses with items/pagination
      let fetchedItems, pagination;
      if (Array.isArray(result)) {
        fetchedItems = result;
        pagination = { hasMore: fetchedItems.length === itemsPerPage };
      } else if (result.items) {
        fetchedItems = result.items;
        pagination = result.pagination || { hasMore: fetchedItems.length === itemsPerPage };
      } else {
        fetchedItems = result.data?.items || result.data || [];
        pagination = result.data?.pagination || result.pagination || { 
          hasMore: fetchedItems.length === itemsPerPage 
        };
      }
      
      if (pageNum === 1) {
        setItems(fetchedItems);
      } else {
        setItems(prevItems => [...prevItems, ...fetchedItems]);
      }
      
      setHasMore(pagination?.hasMore !== false && fetchedItems.length === itemsPerPage);
      
      if (onLoadMore && pageNum > 1) {
        onLoadMore(fetchedItems, pageNum);
      }
    } catch (err) {
      console.error('Failed to fetch items:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load items. Please try again later.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchData, itemsPerPage, onLoadMore]);

  // Reset and fetch first page when dependencies change
  useEffect(() => {
    if (resetOnDependenciesChange) {
      setPage(1);
      setItems([]);
      setHasMore(true);
      setError('');
      fetchItems(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  // Fetch additional pages when page changes
  useEffect(() => {
    if (page > 1) {
      fetchItems(page);
    }
  }, [page, fetchItems]);

  // Initial load if not resetting on dependencies change
  useEffect(() => {
    if (!resetOnDependenciesChange && items.length === 0 && !loading) {
      fetchItems(1);
    }
  }, [resetOnDependenciesChange, items.length, loading, fetchItems]);

  if (loading && items.length === 0) {
    return (
      <div className={className}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error && items.length === 0) {
    if (errorState) {
      return errorState(error);
    }
    return (
      <div className={className}>
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--rustic-pink)' }}>
          {error}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return emptyState || (
      <div className={className}>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No items found
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {items.map((item, index) => (
        <div 
          key={item.id || index} 
          className={itemClassName}
          ref={index === items.length - 1 ? lastElementRef : null}
        >
          {renderItem(item, index, items)}
        </div>
      ))}
      
      {loading && items.length > 0 && (
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner />
        </div>
      )}
      
      {error && items.length > 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--rustic-pink)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

