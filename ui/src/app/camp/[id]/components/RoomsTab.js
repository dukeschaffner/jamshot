import { useState } from 'react';
import RoomCard from './RoomCard';
import CreateRoomModal from './CreateRoomModal';
import { FaDoorOpen, FaPlus } from 'react-icons/fa';
import styles from '../CampDashboard.module.css';

function RoomsTab({ camp, isAdmin, onCampUpdate }) {
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);

  const handleCreateRoom = () => {
    setShowCreateRoom(true);
  };

  const handleRoomClick = (room) => {
    setSelectedRoom(selectedRoom?.id === room.id ? null : room);
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h2>All Rooms</h2>
        {isAdmin && (
          <button onClick={handleCreateRoom} className={styles.primaryButton}>
            <FaPlus />
            <span>Create Room</span>
          </button>
        )}
      </div>

      {!camp.rooms || camp.rooms.length === 0 ? (
        <div className={styles.emptyState}>
          <FaDoorOpen className={styles.emptyIcon} />
          <h3>No Rooms Yet</h3>
          <p>Create rooms to organize your camp members and tracks</p>
          {isAdmin && (
            <button onClick={handleCreateRoom} className={styles.primaryButton}>
              <FaPlus />
              <span>Create First Room</span>
            </button>
          )}
        </div>
      ) : (
        <div className={styles.roomsList}>
          {camp.rooms.map(room => (
            <RoomCard
              key={room.id}
              room={room}
              campId={camp.id}
              isSelected={selectedRoom?.id === room.id}
              onClick={() => handleRoomClick(room)}
            />
          ))}
        </div>
      )}

      {showCreateRoom && (
        <CreateRoomModal
          campId={camp.id}
          onClose={() => setShowCreateRoom(false)}
          onSuccess={(newRoom) => {
            setShowCreateRoom(false);
            if (onCampUpdate) {
              onCampUpdate();
            }
          }}
        />
      )}
    </div>
  );
}

export default RoomsTab;
