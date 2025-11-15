import { useState, useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';
import styles from './InviteLinkModal.module.css';

function InviteLinkModal({ title, entityType, entityId, inviteCode, onClose }) {
  const [inviteLink, setInviteLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (entityId && inviteCode) {
      const path = entityType === 'team' ? 'teams' : 'camp';
      const link = `${window.location.origin}/${path}/${entityId}?code=${inviteCode}`;
      setInviteLink(link);
    }
  }, [entityId, inviteCode, entityType]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="modal-overlay active" onClick={(e) => {
      if (e.target.className === 'modal-overlay active') {
        onClose();
      }
    }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button onClick={onClose} className="modal-close">
            <FaTimes />
          </button>
        </div>
        <div className="modal-body">
          <div className={styles.inviteSection}>
            <h3>Share Invite Link</h3>
            <p>Anyone with this link can join the {entityType === 'team' ? 'team' : 'camp'}</p>
            <div className={styles.inviteLinkBox}>
              <input
                type="text"
                value={inviteLink}
                readOnly
                className={styles.inviteLinkInput}
              />
              <button onClick={handleCopyLink} className={styles.copyButton}>
                {linkCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InviteLinkModal;

