'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Cookies from 'js-cookie';
import Comment from './Comment';
import { fetchComments, addComment } from '../lib/api';
import { FaPaperPlane } from 'react-icons/fa';

// Add a constant for maximum comment length
const MAX_COMMENT_LENGTH = 1000;

export default function CommentSection({ trackId }) {
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [replyingToUsername, setReplyingToUsername] = useState('');
  const [parentCommentId, setParentCommentId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleReplies, setVisibleReplies] = useState({});
  // Add state for character count error
  const [charCountError, setCharCountError] = useState('');
  const commentsEndRef = useRef(null);
  const textareaRef = useRef(null);
  
  // Check if user is authenticated
  const isAuthenticated = !!Cookies.get('accessToken');
  
  const loadComments = useCallback(async (page = 1, parentId = null) => {
    setIsLoading(true);
    try {
      const data = await fetchComments(trackId, page, 10, parentId);
      if (parentId) {
        // Loading replies for a specific comment
        setVisibleReplies({
          ...visibleReplies,
          [parentId]: data.comments
        });
      } else {
        // Loading top-level comments
        if (page === 1) {
          setComments(data.comments);
        } else {
          setComments(prev => [...prev, ...data.comments]);
        }
        setTotalPages(data.pagination.pages);
      }
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [trackId, visibleReplies]);
  
  useEffect(() => {
    loadComments();
  }, [loadComments]);
  
  const handleLoadMore = async () => {
    if (currentPage >= totalPages || isLoadingMore) return;
    
    setIsLoadingMore(true);
    setCurrentPage(prev => prev + 1);
    await loadComments(currentPage + 1);
  };
  
  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    
    // When user scrolls to within 200px of the bottom, load more
    if (scrollHeight - scrollTop - clientHeight < 200 && !isLoadingMore && currentPage < totalPages) {
      handleLoadMore();
    }
  }, [currentPage, totalPages, isLoadingMore]);
  
  const handleCommentChange = (e) => {
    const content = e.target.value;
    if (content.length <= MAX_COMMENT_LENGTH) {
      setCommentContent(content);
      setCharCountError('');
    } else {
      setCharCountError(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
    }
  };
  
  const handleKeyDown = (e) => {
    // Submit on Enter (not Shift+Enter)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCommentSubmit(e);
    }
  };
  
  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    
    if (!isAuthenticated) {
      alert('Please log in to comment');
      return;
    }
    
    if (commentContent.trim() === '') return;
    
    // Validate comment length before submitting
    if (commentContent.length > MAX_COMMENT_LENGTH) {
      setCharCountError(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
      return;
    }
    
    setIsSubmitting(true);
    try {
      const newComment = await addComment(trackId, commentContent, replyTo);
      
      if (replyTo) {
        // Add the reply to the visible replies
        setVisibleReplies(prev => ({
          ...prev,
          [replyTo]: [newComment, ...(prev[replyTo] || [])]
        }));
        
        // Update reply count for the parent comment
        setComments(prev => 
          prev.map(comment => 
            comment.id === replyTo 
              ? { ...comment, reply_count: comment.reply_count + 1 } 
              : comment
          )
        );
        
        // Clear reply state
        setReplyTo(null);
        setReplyingToUsername('');
      } else {
        // Add comment to the top of the list
        setComments(prev => [newComment, ...prev]);
      }
      
      setCommentContent('');
    } catch (err) {
      console.error('Failed to add comment:', err);
      alert('Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleReply = (commentId, username) => {
    // If we're already replying to this comment, just focus the textarea
    if (replyTo === commentId) {
      textareaRef.current?.focus();
      return;
    }
    
    // If commentId already has replies loaded, show them
    if (!visibleReplies[commentId]) {
      loadComments(1, commentId);
    }
    
    setReplyTo(commentId);
    setReplyingToUsername(username);
    
    // Focus the textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };
  
  const handleCancelReply = () => {
    setReplyTo(null);
    setReplyingToUsername('');
  };
  
  const handleDeleteComment = (commentId) => {
    if (replyTo === commentId) {
      setReplyTo(null);
      setReplyingToUsername('');
    }
    
    // Remove the comment
    setComments(prev => prev.filter(comment => comment.id !== commentId));
    
    // Also remove from visible replies if it's there
    const updatedReplies = { ...visibleReplies };
    Object.keys(updatedReplies).forEach(key => {
      updatedReplies[key] = updatedReplies[key].filter(reply => reply.id !== commentId);
    });
    setVisibleReplies(updatedReplies);
  };
  
  const handleUpdateComment = (updatedComment) => {
    // Check if it's in main comments
    const commentIndex = comments.findIndex(c => c.id === updatedComment.id);
    
    if (commentIndex !== -1) {
      setComments(prev => {
        const updated = [...prev];
        updated[commentIndex] = { ...updated[commentIndex], ...updatedComment };
        return updated;
      });
    } else {
      // Check if it's in reply comments
      Object.keys(visibleReplies).forEach(parentId => {
        const replyIndex = visibleReplies[parentId].findIndex(r => r.id === updatedComment.id);
        if (replyIndex !== -1) {
          setVisibleReplies(prev => {
            const updated = { ...prev };
            updated[parentId] = [...updated[parentId]];
            updated[parentId][replyIndex] = { ...updated[parentId][replyIndex], ...updatedComment };
            return updated;
          });
        }
      });
    }
  };
  
  return (
    <div className="comments-section">
      
      {isAuthenticated ? (
        <form className="comment-form" onSubmit={handleCommentSubmit}>
          {replyTo && (
            <div className="replying-to">
              <span>Replying to @{replyingToUsername}</span>
              <button 
                type="button" 
                className="cancel-reply-btn"
                onClick={handleCancelReply}
              >
                Cancel
              </button>
            </div>
          )}
          <div className="comment-input-container">
            <textarea
              ref={textareaRef}
              className="comment-input"
              placeholder={replyTo ? `Reply to @${replyingToUsername}...` : "Add a comment..."}
              value={commentContent}
              onChange={handleCommentChange}
              onKeyDown={handleKeyDown}
              rows={3}
              maxLength={MAX_COMMENT_LENGTH}
              style={{ resize: "none" }}
            />
            {charCountError && <div className="char-count-error">{charCountError}</div>}
            <button 
              type="submit" 
              className="comment-submit-btn"
              disabled={isSubmitting || commentContent.trim() === '' || commentContent.length > MAX_COMMENT_LENGTH}
            >
              <FaPaperPlane />
            </button>
          </div>
        </form>
      ) : (
        <div className="login-prompt">
          <p>Please log in to comment</p>
        </div>
      )}
      
      <div className="comments-list" onScroll={handleScroll}>
        {isLoading && comments.length === 0 ? (
          <div className="comments-loading">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="no-comments">No comments yet. Be the first to comment!</div>
        ) : (
          <>
            {comments.map(comment => (
              <div key={comment.id} className="comment-thread">
                <Comment 
                  comment={comment} 
                  onReply={handleReply}
                  onDelete={handleDeleteComment}
                  onUpdate={handleUpdateComment}
                />
                
                {visibleReplies[comment.id] && visibleReplies[comment.id].length > 0 && (
                  <div className="comment-replies-container">
                    {visibleReplies[comment.id].map(reply => (
                      <Comment 
                        key={reply.id}
                        comment={reply}
                        onReply={handleReply}
                        onDelete={handleDeleteComment}
                        onUpdate={handleUpdateComment}
                        isReply={true}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            
            {isLoadingMore && (
              <div className="loading-more">Loading more comments...</div>
            )}
            
            {!isLoadingMore && currentPage < totalPages && (
              <button 
                className="load-more-btn" 
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                Load more comments
              </button>
            )}
            
            <div ref={commentsEndRef} />
          </>
        )}
      </div>
    </div>
  );
}