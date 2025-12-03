'use client';
import { useRouter } from 'next/navigation';
import { FaUsers, FaArrowRight, FaPlus } from 'react-icons/fa';
import Link from 'next/link';
import styles from './TeamsList.module.css';
import sharedStyles from '../../styles/Dashboard.module.css';

export default function TeamsList({ teams }) {
  const router = useRouter();

  if (!teams || teams.length === 0) {
    return (
      <div className={sharedStyles.emptyState}>
        <FaUsers className={sharedStyles.emptyIcon} />
        <h3>No Teams Yet</h3>
        <p>Create your first team to start collaborating</p>
        <Link href="/teams/create" className={styles.createButton}>
          <FaPlus />
          Create Team
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.teamsListContainer}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerInfo}>
            <FaUsers className={styles.headerIcon} />
            <div>
              <h1 className={styles.title}>Your Teams</h1>
              <p className={styles.subtitle}>Manage and access your team dashboards</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link href="/teams/create" className={styles.createButton}>
              <FaPlus />
              Create Team
            </Link>
            <Link href="/teams/about" className={styles.learnMoreLink}>
              Learn More About Teams
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.teamsGrid}>
        {teams.map((team) => (
          <div
            key={team.id}
            className={styles.teamCard}
            onClick={() => router.push(`/team/${team.id}`)}
          >
            <div className={styles.teamCardContent}>
              <div className={styles.teamIcon}>
                <FaUsers />
              </div>
              <div className={styles.teamInfo}>
                <h3 className={styles.teamName}>{team.name}</h3>
                <div className={styles.teamMeta}>
                  <span className={styles.teamRole}>
                    {team.role === 'owner' ? 'Owner' : team.role === 'admin' ? 'Admin' : 'Member'}
                  </span>
                </div>
              </div>
              <div className={styles.teamArrow}>
                <FaArrowRight />
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

