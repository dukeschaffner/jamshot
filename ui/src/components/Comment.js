'use client';
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FaReply, FaEdit, FaTrash, FaCheckCircle } from 'react-icons/fa';
import Cookies from 'js-cookie';
import TimeDisplay from './TimeDisplay';
import { updateComment, deleteComment } from '../lib/api';
import styles from './Comments.module.css';

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
      className={`${styles.comment} ${isReply ? styles.commentReply : ''}`}
      onMouseEnter={() => setIsActionsVisible(true)}
      onMouseLeave={() => setIsActionsVisible(false)}
    >
      <Image 
        src={comment.profile_pic_url || '/avatar.svg'} 
        alt={comment.username} 
        width={isReply ? 30 : 40} 
        height={isReply ? 30 : 40}
        style={{ height: isReply ? '30px' : '40px' }}
        className="avatar mr-1"
        onClick={navigateToUserProfile}
      />
      <div className={styles.commentContent}>
        <div className={styles.commentHeader}>
          <div className={styles.commentUser}>
            <span className={styles.commentUserName} onClick={navigateToUserProfile}>
              {comment.name || comment.username}
            </span>
            <span className={styles.commentUserHandle} onClick={navigateToUserProfile}>
              @{comment.username}
              {comment.verified && <FaCheckCircle className={styles.commentVerifiedIcon} />}
            </span>
          </div>
          <TimeDisplay timestamp={comment.created_at} className={styles.commentTime} />
          {isEdited && <span className={styles.commentEditedIndicator}>(edited)</span>}
        </div>
        
        {isEditing ? (
          <div className={styles.commentEdit}>
            <textarea 
              ref={textareaRef}
              className={styles.commentEditTextarea}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
            />
            <div className={styles.commentEditActions}>
              <button 
                className={styles.commentCancelBtn} 
                onClick={cancelEdit}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                className={styles.commentSaveBtn} 
                onClick={saveEdit}
                disabled={isSubmitting || editContent.trim() === ''}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.commentText}>{comment.content}</div>
        )}
        
        {!isEditing && !isReply && comment.reply_count > 0 && (
          <button className={styles.commentViewRepliesBtn} onClick={handleReply}>
            View {comment.reply_count} {comment.reply_count === 1 ? 'reply' : 'replies'}
          </button>
        )}
        
        {(isActionsVisible || isReply) && !isEditing && (
          <div className={styles.commentActions}>
            {isAuthenticated && (
              <button className={`${styles.commentActionBtn} ${styles.commentReplyBtn}`} onClick={handleReply} title="Reply">
                <FaReply />
                <span className={styles.commentActionText}>Reply</span>
              </button>
            )}
            {comment.is_owner && (
              <>
                {/* <button className={`${styles.commentActionBtn} ${styles.commentEditBtn}`} onClick={handleEdit} title="Edit">
                  <FaEdit />
                  <span className={styles.commentActionText}>Edit</span>
                </button> */}
                <button className={`${styles.commentActionBtn} ${styles.commentDeleteBtn}`} onClick={handleDelete} title="Delete">
                  <FaTrash />
                  <span className={styles.commentActionText}>Delete</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 