'use client';
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FaReply, FaEdit, FaTrash, FaCheckCircle } from 'react-icons/fa';
import Cookies from 'js-cookie';
import TimeDisplay from './TimeDisplay';
import { updateComment, deleteComment } from '../lib/api';

export default function Comment({ 
  comment, 
  onReply, 
  onDelete, 
  onUpdate,
  isReply = false,
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isActionsVisible, setIsActionsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef(null);
  
  // Check if user is authenticated
  const isAuthenticated = !!Cookies.get('accessToken');
  
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end of text
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleReply = () => {
    if (!isAuthenticated) {
      alert('Please log in to reply to comments');
      return;
    }
    onReply(comment.id, comment.username);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditContent(comment.content);
  };

  const saveEdit = async () => {
    if (editContent.trim() === '') return;
    if (editContent === comment.content) {
      setIsEditing(false);
      return;
    }
    
    setIsSubmitting(true);
    try {
      const updatedComment = await updateComment(comment.id, editContent);
      setIsEditing(false);
      onUpdate(updatedComment);
    } catch (err) {
      console.error('Failed to update comment:', err);
      alert('Failed to update comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    
    setIsSubmitting(true);
    try {
      await deleteComment(comment.id);
      onDelete(comment.id);
    } catch (err) {
      console.error('Failed to delete comment:', err);
      alert('Failed to delete comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const navigateToUserProfile = () => {
    router.push(`/user/${comment.username}`);
  };

  const isEdited = new Date(comment.updated_at).getTime() > new Date(comment.created_at).getTime();

  return (
    <div 
      className={`comment ${isReply ? 'comment-reply' : ''}`}
      onMouseEnter={() => setIsActionsVisible(true)}
      onMouseLeave={() => setIsActionsVisible(false)}
    >
      <div className="comment-avatar" onClick={navigateToUserProfile}>
        <Image 
          src={comment.profile_pic_url || '/avatar.svg'} 
          alt={comment.username} 
          width={isReply ? 30 : 40} 
          height={isReply ? 30 : 40}
          className="comment-avatar-image"
        />
      </div>
      <div className="comment-content">
        <div className="comment-header">
          <div className="comment-user">
            <span className="comment-user-name" onClick={navigateToUserProfile}>
              {comment.name || comment.username}
            </span>
            <span className="comment-user-handle" onClick={navigateToUserProfile}>
              @{comment.username}
              {comment.verified && <FaCheckCircle className="comment-verified-icon" />}
            </span>
          </div>
          <TimeDisplay timestamp={comment.created_at} className="comment-time" />
          {isEdited && <span className="comment-edited-indicator">(edited)</span>}
        </div>
        
        {isEditing ? (
          <div className="comment-edit">
            <textarea 
              ref={textareaRef}
              className="comment-edit-textarea"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
            />
            <div className="comment-edit-actions">
              <button 
                className="comment-cancel-btn" 
                onClick={cancelEdit}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                className="comment-save-btn" 
                onClick={saveEdit}
                disabled={isSubmitting || editContent.trim() === ''}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="comment-text">{comment.content}</div>
        )}
        
        {!isEditing && !isReply && comment.reply_count > 0 && (
          <button className="comment-view-replies-btn" onClick={handleReply}>
            View {comment.reply_count} {comment.reply_count === 1 ? 'reply' : 'replies'}
          </button>
        )}
        
        {(isActionsVisible || isReply) && !isEditing && (
          <div className="comment-actions">
            {isAuthenticated && (
              <button className="comment-action-btn comment-reply-btn" onClick={handleReply} title="Reply">
                <FaReply />
                <span className="comment-action-text">Reply</span>
              </button>
            )}
            {comment.is_owner && (
              <>
                {/* <button className="comment-action-btn comment-edit-btn" onClick={handleEdit} title="Edit">
                  <FaEdit />
                  <span className="comment-action-text">Edit</span>
                </button> */}
                <button className="comment-action-btn comment-delete-btn" onClick={handleDelete} title="Delete">
                  <FaTrash />
                  <span className="comment-action-text">Delete</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 