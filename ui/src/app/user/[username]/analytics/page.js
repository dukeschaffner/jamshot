'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { analyticsApi, userApi } from '../../../../lib/api';
import { useUser } from '../../../../contexts/UserContext';
import TimeSelector from '../../../../components/analytics/TimeSelector';
import MetricSelector from '../../../../components/analytics/MetricSelector';
import ChartJSAnalyticsChart from '../../../../components/analytics/ChartJSAnalyticsChart';
import AnalyticsTable from '../../../../components/analytics/AnalyticsTable';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import styles from './UserAnalytics.module.css';

export default function UserAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useUser();
  const [analyticsData, setAnalyticsData] = useState([]);
  const [tracksData, setTracksData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('plays');
  const [countryFilter, setCountryFilter] = useState('');
  const [timeRange, setTimeRange] = useState({
    start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    period: 'day'
  });

  const username = params.username;
  const isOwnProfile = user?.username === username;

  useEffect(() => {
    if (!isAuthenticated) {
        setError('You must be logged in to view analytics.');
        setLoading(false);
        return;
      }
      // Analytics should only be viewable by the user themselves
      if (!isOwnProfile) {
        setError('You can only view your own analytics.');
        setLoading(false);
        return;
      }
  }, [isAuthenticated, isOwnProfile]);

  useEffect(() => {
    if (user && isOwnProfile) {
      fetchAnalyticsData();
    }
  }, [user, timeRange, selectedMetric, countryFilter]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      
      const params = {
        ...timeRange,
        metric: selectedMetric,
        ...(countryFilter && { country: countryFilter })
      };

      const response = await analyticsApi.getUserAnalytics('me', params);
      setAnalyticsData(response.data.analytics || []);
      
      // Fetch track-level data for the overview table
      //fetchTracksOverview();
      
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTracksOverview = async () => {
    try {
      // This would need to be implemented in the API - get user's tracks with analytics summary
      const response = await userApi.getUserTracks(user.id, 1, 20);
      setTracksData(response.data.tracks || []);
    } catch (err) {
      console.error('Error fetching tracks overview:', err);
    }
  };

  const handleTimeRangeChange = (newTimeRange) => {
    setTimeRange(newTimeRange);
  };

  const handleMetricChange = (metric) => {
    setSelectedMetric(metric);
  };

  const handleFilterChange = (filter) => {
    setCountryFilter(filter);
  };

  const handleTrackClick = (trackId) => {
    router.push(`/user/${username}/analytics/track/${trackId}`);
  };

  const getChartTitle = () => {
    const metricLabels = {
      plays: 'Plays',
      listeners: 'Listeners', 
      likes: 'Likes',
      comments: 'Comments',
      reposts: 'Reposts',
      shares: 'Shares',
      collaborations: 'Collaborations'
    };
    
    return `${metricLabels[selectedMetric] || selectedMetric} Over Time`;
  };

  const getChartColor = () => {
    const colors = {
      plays: '#93E9BE',
      listeners: '#E9A9A1',
      likes: '#fc3232',
      comments: '#86a699',
      reposts: '#f59771',
      shares: '#e4a794',
      collaborations: '#036745'
    };
    
    return colors[selectedMetric] || '#93E9BE';
  };

  const trackTableColumns = [
    { field: 'title', label: 'Track', type: 'default' },
    { field: 'play_count', label: 'Plays', type: 'number' },
    { field: 'like_count', label: 'Likes', type: 'number' },
    { field: 'comment_count', label: 'Comments', type: 'number' },
    { field: 'repost_count', label: 'Reposts', type: 'number' },
    { field: 'created_at', label: 'Uploaded', type: 'date' },
  ];

  if (loading && !user) {
    return (
      <div className={styles.container}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Analytics Unavailable</h2>
          <p>{error}</p>
          <button 
            className="pill-btn"
            onClick={() => router.back()}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>
            Your Analytics
          </h1>
          <p className={styles.subtitle}>
            Track your performance and understand your audience
          </p>
        </div>
      </div>

      <div className={styles.controls}>
        <TimeSelector onTimeRangeChange={handleTimeRangeChange} />
        <MetricSelector
          selectedMetric={selectedMetric}
          onMetricChange={handleMetricChange}
          onFilterChange={handleFilterChange}
          showCountryFilter={true}
        />
      </div>

      <div className={styles.content}>
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <ChartJSAnalyticsChart
              data={analyticsData}
              metric={selectedMetric}
              title={getChartTitle()}
              type="line"
              color={getChartColor()}
              height={300}
              isDateBased={true}
              timeRange={timeRange}
            />

            {/* Track Overview Table */}
            <AnalyticsTable
              data={tracksData}
              title="Track Performance"
              columns={trackTableColumns}
              sortable={true}
              searchable={true}
              maxRows={20}
            />

            {/* Geographic Data */}
            {(selectedMetric === 'plays' || selectedMetric === 'listeners') && (
              <div className={styles.geographicSection}>
                <h3>Geographic Breakdown</h3>
                <div className={styles.geographicGrid}>
                  <div className={styles.geographicCard}>
                    <h4>Top Countries</h4>
                    <div className={styles.geographicList}>
                      {/* This would be populated from the analytics data */}
                      <div className={styles.geographicItem}>
                        <span className={styles.country}>🇺🇸 United States</span>
                        <span className={styles.count}>1,234</span>
                      </div>
                      <div className={styles.geographicItem}>
                        <span className={styles.country}>🇬🇧 United Kingdom</span>
                        <span className={styles.count}>856</span>
                      </div>
                      <div className={styles.geographicItem}>
                        <span className={styles.country}>🇨🇦 Canada</span>
                        <span className={styles.count}>432</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className={styles.geographicCard}>
                    <h4>Top Cities</h4>
                    <div className={styles.geographicList}>
                      <div className={styles.geographicItem}>
                        <span className={styles.country}>New York, NY</span>
                        <span className={styles.count}>345</span>
                      </div>
                      <div className={styles.geographicItem}>
                        <span className={styles.country}>London, UK</span>
                        <span className={styles.count}>289</span>
                      </div>
                      <div className={styles.geographicItem}>
                        <span className={styles.country}>Toronto, CA</span>
                        <span className={styles.count}>156</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
