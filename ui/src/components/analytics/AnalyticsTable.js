'use client';
import { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FaCrown } from 'react-icons/fa';
import styles from './AnalyticsTable.module.css';

const AnalyticsTable = ({ 
  data = [], 
  title = 'Analytics Data',
  columns = [],
  sortable = true,
  searchable = false,
  maxRows = 50,
  hasDetailedAccess = true
}) => {
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAll, setShowAll] = useState(false);

  const sortedAndFilteredData = useMemo(() => {
    let processedData = [...data];

    // Apply search filter
    if (searchTerm && searchable) {
      processedData = processedData.filter(item =>
        Object.values(item).some(value =>
          value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply sorting
    if (sortField && sortable) {
      processedData.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        const aStr = aVal?.toString() || '';
        const bStr = bVal?.toString() || '';
        
        if (sortDirection === 'asc') {
          return aStr.localeCompare(bStr);
        } else {
          return bStr.localeCompare(aStr);
        }
      });
    }

    // Apply row limit
    if (!showAll && processedData.length > maxRows) {
      processedData = processedData.slice(0, maxRows);
    }

    return processedData;
  }, [data, sortField, sortDirection, searchTerm, showAll, searchable, sortable, maxRows]);

  const handleSort = (field) => {
    if (!sortable) return;
    
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const formatValue = (value, type = 'default', row = null, field = null) => {
    if (value === null || value === undefined) return '-';
    
    switch (type) {
      case 'number':
        if (typeof value === 'number') {
          if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
          } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
          }
          return value.toLocaleString();
        }
        return value;
      case 'percentage':
        return typeof value === 'number' ? `${value.toFixed(1)}%` : value;
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'country':
        // You could add a country code to name mapping here
        return value;
      case 'user':
        // Special case for user with avatar and username
        const avatarUrl = row?.avatar || '/avatar.svg';
        const username = value || 'Unknown User';
        return (
          <div className={styles.userCell}>
            <Image
              src={avatarUrl}
              alt={username}
              width={24}
              height={24}
              className={styles.userAvatar}
            />
            <span className={`${styles.username} ${!hasDetailedAccess ? styles.blurred : ''}`}>
              {username}
            </span>
          </div>
        );
      default:
        return value;
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  if (!data || data.length === 0) {
    return (
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>{title}</h3>
        </div>
        <div className={styles.noData}>
          <div className={styles.noDataIcon}>📋</div>
          <p>No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      <div className={styles.tableHeader}>
        <h3 className={styles.tableTitle}>{title}</h3>
        {searchable && (
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        )}
      </div>
      
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.field}
                  className={`${styles.tableHeaderCell} ${sortable ? styles.sortable : ''}`}
                  data-type={column.type}
                  onClick={() => handleSort(column.field)}
                >
                  <div className={styles.headerContent}>
                    <span>{column.label}</span>
                    {sortable && (
                      <span className={styles.sortIcon}>
                        {getSortIcon(column.field)}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedAndFilteredData.map((row, index) => (
              <tr key={index} className={styles.tableRow}>
                {columns.map((column) => (
                  <td 
                    key={column.field} 
                    className={styles.tableCell}
                    data-type={column.type}
                  >
                    {formatValue(row[column.field], column.type, row, column.field)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {data.length > maxRows && (
        <div className={styles.tableFooter}>
          <button
            className={styles.showMoreButton}
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show Less' : `Show All (${data.length} items)`}
          </button>
        </div>
      )}
      
      {searchTerm && sortedAndFilteredData.length === 0 && (
        <div className={styles.noResults}>
          <p>No results found for "{searchTerm}"</p>
        </div>
      )}
      
      {!hasDetailedAccess && data.length > 0 && (
        <div className={styles.upgradePrompt}>
          <div className={styles.upgradeContent}>
            <FaCrown className={styles.crownIcon} />
            <div className={styles.upgradeText}>
              <h4>Want to see who's listening?</h4>
              <p>Upgrade to Premium to see detailed listener information and unlock advanced analytics features.</p>
            </div>
            <Link href="/subscribe" className={styles.upgradeButton}>
              Upgrade to Premium
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsTable;
