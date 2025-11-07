'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { analyticsApi, userApi, trackApi } from '../../../../lib/api';
import { useUser } from '../../../../contexts/UserContext';
import { getUserTier, SUBSCRIPTION_TIERS } from '../../../../lib/subscriptionUtils';
import { getCountryName, getCountryFlag } from '../../../../../shared/utils/formatting.js';
import TimeSelector from '../../../../components/analytics/TimeSelector';
import MetricSelector from '../../../../components/analytics/MetricSelector';
import ChartJSAnalyticsChart from '../../../../components/analytics/ChartJSAnalyticsChart';
import AnalyticsTable from '../../../../components/analytics/AnalyticsTable';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { FaCrown } from 'react-icons/fa';
import styles from './UserAnalytics.module.css';

export default function UserAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useUser();
  const [analyticsData, setAnalyticsData] = useState([]);
  const [tracksData, setTracksData] = useState([]);
  const [geographicData, setGeographicData] = useState([]);
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
  const isFreeTier = getUserTier(user) === SUBSCRIPTION_TIERS.FREE;

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
    if (user && isOwnProfile && !isFreeTier) {
      fetchAnalyticsData();
    } else if (user && isOwnProfile && isFreeTier) {
      // Free tier users don't need to fetch analytics data
      setLoading(false);
    }
  }, [user, timeRange, isOwnProfile, isFreeTier]);

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
      setError('');

      // Parse geographic data if available
      if (response.data.analytics && response.data.analytics.length > 0) {
        const latestData = response.data.analytics[0]; // Get the most recent data point

        // Parse geographic data
        if (latestData.listener_geographic_data) {
          try {
            const geoObj = typeof latestData.listener_geographic_data === 'string'
              ? JSON.parse(latestData.listener_geographic_data)
              : latestData.listener_geographic_data;

            const geoArray = Object.values(geoObj).map(location => ({
              country: getCountryName(location.country_code),
              country_code: location.country_code,
              city: location.city,
              region: location.region,
              plays: location.count,
              listeners: location.count // Assuming plays = listeners for now
            }));

            setGeographicData(geoArray);
          } catch (err) {
            console.error('Error parsing geographic data:', err);
            setGeographicData([]);
          }
        } else {
          setGeographicData([]);
        }
      } else {
        setGeographicData([]);
      }

      // Fetch track-level data for the overview table
      fetchTracksOverview();
      
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTracksOverview = async () => {
    try {
      const params = {
        ...timeRange,
        period: timeRange.period
      };

      const response = await analyticsApi.getUserTrackAnalytics(params);
      setTracksData(response.data.tracks || []);
    } catch (err) {
      console.error('Error fetching tracks overview:', err);
      setTracksData([]);
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

      {isFreeTier ? (
        <div className={styles.upgradePrompt}>
          <div className={styles.upgradeContent}>
            <FaCrown className={styles.crownIcon} />
            <div className={styles.upgradeText}>
              <h4>Upgrade to Get Access to Analytics</h4>
              <p>Unlock detailed insights including charts, geographic data, track performance metrics, and more.</p>
            </div>
            <Link href="/subscribe" className={styles.upgradeButton}>
              Upgrade to Premium
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.controls}>
            <TimeSelector onTimeRangeChange={handleTimeRangeChange} />
            <MetricSelector
              selectedMetric={selectedMetric}
              onMetricChange={handleMetricChange}
              onFilterChange={handleFilterChange}
              showCountryFilter={true}
              availableCountries={geographicData}
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
                  variant="user"
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
                {(selectedMetric === 'plays' || selectedMetric === 'listeners') && geographicData.length > 0 && (
                  <div className={styles.geographicSection}>
                    <h3>Geographic Breakdown</h3>
                    <div className={styles.geographicGrid}>
                      <div className={styles.geographicCard}>
                        <h4>Top Countries</h4>
                        <div className={styles.geographicList}>
                          {geographicData
                            .reduce((countries, location) => {
                              const existing = countries.find(c => c.country_code === location.country_code);
                              if (existing) {
                                existing.plays += location.plays;
                                existing.listeners += location.listeners;
                              } else {
                                countries.push({
                                  country: location.country,
                                  country_code: location.country_code,
                                  plays: location.plays,
                                  listeners: location.listeners
                                });
                              }
                              return countries;
                            }, [])
                            .sort((a, b) => b.plays - a.plays)
                            .slice(0, 10)
                            .map((country, index) => (
                              <div key={country.country_code} className={styles.geographicItem}>
                                <span className={styles.country}>
                                  {getCountryFlag(country.country_code)} {country.country}
                                </span>
                                <span className={styles.count}>{country.plays.toLocaleString()}</span>
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className={styles.geographicCard}>
                        <h4>Top Cities</h4>
                        <div className={styles.geographicList}>
                          {geographicData
                            .sort((a, b) => b.plays - a.plays)
                            .slice(0, 10)
                            .map((location, index) => (
                              <div key={`${location.country_code}-${location.city}`} className={styles.geographicItem}>
                                <span className={styles.country}>
                                  {location.city}, {location.region}
                                </span>
                                <span className={styles.count}>{location.plays.toLocaleString()}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
