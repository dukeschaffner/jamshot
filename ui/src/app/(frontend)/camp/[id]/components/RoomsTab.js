'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RoomCard from './RoomCard';
import CreateRoomModal from './CreateRoomModal';
import { FaDoorOpen, FaPlus } from 'react-icons/fa';
import sharedStyles from '@/styles/Dashboard.module.css';
import styles from '../CampDashboard.module.css';

function RoomsTab({ camp, isAdmin, onCampUpdate }) {
  const router = useRouter();
  const [showCreateRoom, setShowCreateRoom] = useState(false);

  const handleCreateRoom = () => {
    setShowCreateRoom(true);
  };

  const handleRoomClick = (room) => {
    router.push(`/camp/${camp.id}?roomId=${room.id}`);
  };

  return (
    <div className={sharedStyles.tabContent}>
      <div className={sharedStyles.tabHeader}>
        <h2>All Rooms</h2>
        {isAdmin && (
          <button onClick={handleCreateRoom} className={sharedStyles.primaryButton}>
            <FaPlus />
            Create Room
          </button>
        )}
      </div>

      {!camp.rooms || camp.rooms.length === 0 ? (
        <div className={sharedStyles.emptyState}>
          <FaDoorOpen className={sharedStyles.emptyIcon} />
          <h3>No Rooms Yet</h3>
          <p>Create rooms to organize your camp members and tracks</p>
          {isAdmin && (
            <button onClick={handleCreateRoom} className={sharedStyles.primaryButton}>
              <FaPlus />
              Create First Room
            </button>
          )}
        </div>
      ) : (
        <div className={styles.roomsList}>
          {camp.rooms.map(room => (
            <RoomCard
              key={room.id}
              room={room}
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
