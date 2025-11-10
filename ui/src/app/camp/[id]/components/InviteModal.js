import { useState, useEffect } from 'react';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { FaTimes, FaSearch } from 'react-icons/fa';
import styles from '../CampDashboard.module.css';

function InviteModal({ camp, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const link = `${window.location.origin}/camp/${camp.id}?code=${camp.camp_code}`;
    setInviteLink(link);
  }, [camp.id, camp.camp_code]);

  const handleSearch = async (query) => {
    if (!query) {
      setSearchResults([]);
      return;
    }

    // TODO: Implement user search
    setIsSearching(true);
    // Placeholder
    setTimeout(() => {
      setSearchResults([]);
      setIsSearching(false);
    }, 500);
  };

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
          <h2 className="modal-title">Invite to Camp</h2>
          <button onClick={onClose} className="modal-close">
            <FaTimes />
          </button>
        </div>
        <div className="modal-body">
          <div className={styles.inviteSection}>
            <h3>Search Users</h3>
            <div className={styles.searchBox}>
              <FaSearch />
              <input
                type="text"
                placeholder="Search by username or name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                className={styles.searchInput}
              />
            </div>
            {isSearching && <LoadingSpinner />}
            {searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {/* TODO: Render search results */}
              </div>
            )}
          </div>

          <div className={styles.divider}>
            <span>OR</span>
          </div>

          <div className={styles.inviteSection}>
            <h3>Share Invite Link</h3>
            <p>Anyone with this link can join the camp</p>
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

export default InviteModal;
