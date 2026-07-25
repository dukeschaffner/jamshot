'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { analyticsApi, trackApi } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { getUserTier, SUBSCRIPTION_TIERS } from '@sterio/subscription-utils';
import { getCountryName } from '@sterio/formatting-utils';
import TimeSelector from '@/components/analytics/TimeSelector';
import MetricSelector from '@/components/analytics/MetricSelector';
import ChartJSAnalyticsChart from '@/components/analytics/ChartJSAnalyticsChart';
import AnalyticsTable from '@/components/analytics/AnalyticsTable';
import LoadingSpinner from '@/components/LoadingSpinner';
import { FaArrowLeft, FaPlay, FaHeart, FaComment, FaShare, FaCrown } from 'react-icons/fa';
import styles from './TrackAnalytics.module.css';

export default function TrackAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const { user: currentUser, isAuthenticated } = useUser();
  const { isFeatureEnabled } = useFeatureFlags();
  const [track, setTrack] = useState(null);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [streamsData, setStreamsData] = useState([]);
  const [discoveryData, setDiscoveryData] = useState([]);
  const [ageRangeData, setAgeRangeData] = useState([]);
  const [geographicData, setGeographicData] = useState([]);
  const [hasDetailedAccess, setHasDetailedAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('plays');
  const [countryFilter, setCountryFilter] = useState('');
  const [timeRange, setTimeRange] = useState({
    start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    period: 'day'
  });

  const { username, trackId } = params;
  const isOwnTrack = currentUser?.username === username;
  const isFreeTier = getUserTier(currentUser) === SUBSCRIPTION_TIERS.FREE;

  useEffect(() => {
    // Check if subscriptions feature is enabled
    if (!isFeatureEnabled('subscriptions', false)) {
      setError('Analytics are not available at this time.');
      setLoading(false);
      return;
    }
    
    if (!isAuthenticated) {
      return;
    }
    fetchTrackData();
  }, [trackId, isAuthenticated, isFeatureEnabled]);

  useEffect(() => {
    if (track && !isFreeTier) {
      fetchAnalyticsData();
    }
  }, [track, timeRange, isFreeTier]);

  const fetchTrackData = async () => {
    try {
      const response = await trackApi.getTrack(trackId);
      
      // Check if user owns this track - analytics should only be viewable by track owner
      if (response.data[0].user_id !== currentUser?.id) {
        setError('You can only view analytics for your own tracks.');
        setLoading(false);
        return;
      }

      setTrack(response.data[0]);
      
    } catch (err) {
      console.error('Error fetching track:', err);
      setError('Track not found or analytics not accessible.');
      setLoading(false);
    }
  };

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      
      const params = timeRange;

      // Fetch main analytics data
      const response = await analyticsApi.getTrackAnalytics(trackId, params);
      setAnalyticsData(response.data.analytics || []);
      
      // Fetch streams by user data from the new endpoint
      const streamsParams = {
        start_date: timeRange.start_date,
        end_date: timeRange.end_date
      };
      const streamsResponse = await analyticsApi.getTrackStreams(trackId, streamsParams);
      
      // Store the detailed access flag from the API response
      setHasDetailedAccess(streamsResponse.data.has_detailed_access || false);
      
      // Transform the streams data to match expected format
      const transformedStreamsData = (streamsResponse.data.streams || []).map(stream => ({
        username: stream.username,
        streams: stream.play_count, // API returns play_count, UI expects streams
        avatar: stream.profile_pic_url
      }));
      setStreamsData(transformedStreamsData);
      
      // Parse the detailed analytics data from the response
      if (response.data.analytics && response.data.analytics.length > 0) {
        const latestData = response.data.analytics[0]; // Get the most recent data point
        
        // Parse discovery methods
        if (latestData.discovery_methods) {
          try {
            const discoveryArray = Object.entries(latestData.discovery_methods).map(([method, count]) => ({
              method: method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Format method name
              count: count
            }));
            setDiscoveryData(discoveryArray);
          } catch (err) {
            console.error('Error parsing discovery methods:', err);
          }
        }
        
        // Parse age ranges
        if (latestData.age_ranges) {
          try {
            const ageArray = Object.entries(latestData.age_ranges)
              .filter(([range]) => range !== 'unknown') // Filter out unknown ages
              .map(([range, count]) => ({
                range: range.replace('_', '-'), // Convert 18_24 to 18-24
                count: count
              }));
            setAgeRangeData(ageArray);
          } catch (err) {
            console.error('Error parsing age ranges:', err);
          }
        }
        
        // Parse geographic data
        if (latestData.geographic_data) {
          try {
            const geoArray = Object.values(latestData.geographic_data).map(location => ({
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
          }
        }
      } else {
        // Initialize empty arrays if no data
        setDiscoveryData([]);
        setAgeRangeData([]);
        setGeographicData([]);
      }
      
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics data.');
      // Set empty arrays on error
      setStreamsData([]);
      setDiscoveryData([]);
      setAgeRangeData([]);
      setGeographicData([]);
    } finally {
      setLoading(false);
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

  const handleBackClick = () => {
    router.push(`/user/${username}/analytics`);
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

  const streamsTableColumns = [
    { field: 'username', label: 'User', type: 'user' },
    { field: 'streams', label: 'Streams', type: 'number' },
  ];

  const discoveryTableColumns = [
    { field: 'method', label: 'Discovery Method', type: 'default' },
    { field: 'count', label: 'Count', type: 'number' },
  ];

  const ageRangeTableColumns = [
    { field: 'range', label: 'Age Range', type: 'default' },
    { field: 'count', label: 'Listeners', type: 'number' },
  ];

  const geographicTableColumns = [
    { field: 'country', label: 'Country', type: 'default' },
    { field: 'plays', label: 'Plays', type: 'number' },
    { field: 'listeners', label: 'Listeners', type: 'number' },
  ];

  if (loading && !track) {
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
            onClick={handleBackClick}
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
        <button 
          className={styles.backButton}
          onClick={handleBackClick}
        >
          <FaArrowLeft />
          Back to User Analytics
        </button>
        
        <div className={styles.trackInfo}>
          <h1 className={styles.title}>{track?.title}</h1>
          
          <div className={styles.trackStats}>
            <div className={styles.stat}>
              <FaPlay className={styles.statIcon} />
              <span>{track?.play_count?.toLocaleString() || 0} plays</span>
            </div>
            <div className={styles.stat}>
              <FaHeart className={styles.statIcon} />
              <span>{track?.like_count?.toLocaleString() || 0} likes</span>
            </div>
            <div className={styles.stat}>
              <FaComment className={styles.statIcon} />
              <span>{track?.comment_count?.toLocaleString() || 0} comments</span>
            </div>
          </div>
        </div>
      </div>

      {!isFreeTier && (
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
      )}

      {isFreeTier ? (
        <div className={styles.upgradePrompt}>
          <div className={styles.upgradeContent}>
            <FaCrown className={styles.crownIcon} />
            <div className={styles.upgradeText}>
              <h4>Upgrade to Get Access to Analytics</h4>
              <p>Unlock detailed insights including charts, geographic data, age demographics, and more.</p>
            </div>
            <Link href="/subscribe" className={styles.upgradeButton}>
              Upgrade to Premium
            </Link>
          </div>
        </div>
      ) : (
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
                variant="track"
              />

              {/* Detailed Analytics */}
              <>
                {/* Streams by User */}
                <AnalyticsTable
                  data={streamsData}
                  title="Streams by User"
                  columns={streamsTableColumns}
                  sortable={true}
                  maxRows={10}
                  hasDetailedAccess={hasDetailedAccess}
                />

                {/* Discovery Methods */}
                <div className={styles.analyticsGrid}>
                  <div className={styles.analyticsCard}>
                    <ChartJSAnalyticsChart
                      data={discoveryData.map(item => ({ period_start: item.method, [selectedMetric]: item.count }))}
                      metric={selectedMetric}
                      title="Source of Streams"
                      type="bar"
                      color="#86a699"
                      height={250}
                      isDateBased={false}
                      variant="track"
                    />
                  </div>
                  
                  <div className={styles.analyticsCard}>
                    <ChartJSAnalyticsChart
                      data={ageRangeData.map(item => ({ period_start: item.range, [selectedMetric]: item.count }))}
                      metric={selectedMetric}
                      title="Listeners by Age Range"
                      type="bar"
                      color="#E9A9A1"
                      height={250}
                      isDateBased={false}
                      variant="track"
                    />
                  </div>
                </div>

                {/* Geographic Data */}
                <AnalyticsTable
                  data={geographicData}
                  title="Countries & Cities"
                  columns={geographicTableColumns}
                  sortable={true}
                  searchable={true}
                  maxRows={20}
                />
              </>

            </>
          )}
        </div>
      )}
    </div>
  );
}
