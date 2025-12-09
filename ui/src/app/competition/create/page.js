'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import { FaTrophy, FaCalendarAlt, FaDollarSign, FaUsers, FaClock, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { competitionApi, trackApi } from '../../../lib/api';
import styles from './CompetitionCreate.module.css';

function CreateCompetitionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useUser();
  
  // Form state
  const [formData, setFormData] = useState({
    track_id: '',
    startdate: '',
    enddate: '',
    prize_amount: '',
    winner_selection_method: 'automated',
    pinned: false,
    voucher_code: ''
  });
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userTracks, setUserTracks] = useState([]);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState(null);
  
  // Get track ID from URL params
  const trackId = searchParams.get('track');
  const paymentResult = searchParams.get('payment');

  useEffect(() => {
    // Only proceed if authenticated
    if (!isAuthenticated) {
      return;
    }

    // Handle payment result (only for canceled payments now, since success goes directly to competitions)
    if (paymentResult === 'canceled') {
      setPaymentStatus('canceled');
      setError('Payment was canceled. Competition creation failed.');
    }

    // Set track ID if provided
    if (trackId) {
      setFormData(prev => ({ ...prev, track_id: trackId }));
    }

    // Load user's tracks
    loadUserTracks();
  }, [isAuthenticated, router, trackId, paymentResult, user?.id]);

  const loadUserTracks = async () => {
    if (!user?.id) return;
    
    try {
      setLoadingTracks(true);
      const response = await trackApi.getUserTracks(user.id);
      setUserTracks(response.data?.tracks || []);
    } catch (err) {
      console.error('Error loading tracks:', err);
      setError('Failed to load your tracks');
    } finally {
      setLoadingTracks(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear errors when user starts typing
    if (error) setError('');
  };

  const validateForm = () => {
    if (!formData.track_id) {
      setError('Please select a track');
      return false;
    }
    if (!formData.startdate) {
      setError('Please select a start date');
      return false;
    }
    if (!formData.enddate) {
      setError('Please select an end date');
      return false;
    }
    if (!formData.prize_amount || parseInt(formData.prize_amount) < 5) {
      setError('Prize amount must be at least $5');
      return false;
    }

    const startDate = new Date(formData.startdate);
    const endDate = new Date(formData.enddate);
    const now = new Date();

    // Convert to UTC for comparison (user inputs are in local time)
    const startDateUTC = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000));
    const endDateUTC = new Date(endDate.getTime() - (endDate.getTimezoneOffset() * 60000));
    const nowUTC = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));

    if (startDateUTC <= nowUTC) {
      setError('Start date must be in the future');
      return false;
    }

    if (endDateUTC <= startDateUTC) {
      setError('End date must be after start date');
      return false;
    }

    const durationDays = (endDateUTC.getTime() - startDateUTC.getTime()) / (1000 * 60 * 60 * 24);
    if (durationDays < 1 || durationDays > 30) {
      setError('Competition duration must be between 1 day and 1 month');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setError('');

    try {
      // Convert local datetime inputs to UTC ISO strings for storage
      const startDate = new Date(formData.startdate);
      const endDate = new Date(formData.enddate);

      // Convert to UTC ISO strings
      const startDateUTC = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000)).toISOString();
      const endDateUTC = new Date(endDate.getTime() - (endDate.getTimezoneOffset() * 60000)).toISOString();

      const response = await competitionApi.createCompetition({
        ...formData,
        startdate: startDateUTC,
        enddate: endDateUTC,
        prize_amount: parseInt(formData.prize_amount) * 100 // Convert to cents
      });
      
      if (response.data.payment_required) {
        // Redirect to Stripe checkout
        window.location.href = response.data.checkout_session.url;
      } else {
        // Competition created without payment
        setSuccess('Competition created successfully!');
        setTimeout(() => {
          router.push(`/competition/${response.data.competition.id}`);
        }, 2000);
      }
    } catch (err) {
      console.error('Error creating competition:', err);
      setError(err.response?.data?.error || 'Failed to create competition');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateFees = () => {
    const prizeAmount = parseInt(formData.prize_amount) || 0;
    const platformFee = Math.round(prizeAmount * 0.15); // 15% platform fee
    const pinningFee = formData.pinned ? 25 : 0; // $25 for pinning
    const totalFee = prizeAmount + platformFee + pinningFee;
    
    return {
      prizeAmount,
      platformFee,
      pinningFee,
      totalFee
    };
  };

  const fees = calculateFees();

  if (!isAuthenticated) {
    return (
      <div className={styles.competitionCreateContainer}>
        <div className="about-header">
          <h1 className="about-title">Create Competition</h1>
          <p className="about-subtitle">Host a competition to inspire collaboration and creativity</p>
        </div>
        
        <div className={styles.authMessage}>
          <div className={styles.authMessageContent}>
            <FaExclamationTriangle className={styles.authMessageIcon} />
            <h3>Authentication Required</h3>
            <p>You need to be logged in to create a competition. Please sign in to continue.</p>
            <button 
              onClick={() => router.push('/login')}
              className="pill-btn gradient-btn"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.competitionCreateContainer}>
      <div className="about-header">
        <h1 className="about-title">Create Competition</h1>
        <p className="about-subtitle">Host a competition to inspire collaboration and creativity</p>
      </div>

      {/* Payment Status Messages */}
      {paymentStatus === 'canceled' && (
        <div className="payment-status canceled">
          <FaExclamationTriangle style={{ marginRight: '8px' }} />
          Payment was canceled. Competition creation failed.
        </div>
      )}

      <div className={styles.competitionFormContainer}>
        <form onSubmit={handleSubmit} className={styles.competitionForm}>
          {/* Track Selection */}
          <div className={styles.formSection}>
            <h3>
              <FaTrophy style={{ marginRight: '8px' }} />
              Select Track
            </h3>
            <div className={styles.formGroup}>
              <label htmlFor="track_id">Choose a track to host the competition</label>
              {loadingTracks ? (
                <div className="loading-spinner">
                  <div className="spinner-icon">⟳</div>
                  Loading your tracks...
                </div>
              ) : (
                <select
                  id="track_id"
                  name="track_id"
                  value={formData.track_id}
                  onChange={handleInputChange}
                  required
                  className={styles.formSelect}
                >
                  <option value="">Select a track...</option>
                  {userTracks.map(track => (
                    <option key={track.id} value={track.id}>
                      {track.title} {track.is_private && '(Private)'}
                    </option>
                  ))}
                </select>
              )}
              <p className={styles.formHelp}>
                Only your own tracks can be used for competitions. The track will serve as the base for participants to collaborate on.
              </p>
            </div>
          </div>

          {/* Competition Details */}
          <div className={styles.formSection}>
            <h3>
              <FaCalendarAlt style={{ marginRight: '8px' }} />
              Competition Details
            </h3>
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="startdate">Start Date</label>
                <input
                  type="datetime-local"
                  id="startdate"
                  name="startdate"
                  value={formData.startdate}
                  onChange={handleInputChange}
                  required
                  className={styles.formInput}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="enddate">End Date</label>
                <input
                  type="datetime-local"
                  id="enddate"
                  name="enddate"
                  value={formData.enddate}
                  onChange={handleInputChange}
                  required
                  className={styles.formInput}
                  min={formData.startdate || new Date().toISOString().slice(0, 16)}
                />
              </div>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="prize_amount">Prize Amount (USD)</label>
              <div className={styles.inputWithIcon}>
                <FaDollarSign className={styles.inputIcon} />
                <input
                  type="number"
                  id="prize_amount"
                  name="prize_amount"
                  value={formData.prize_amount}
                  onChange={handleInputChange}
                  required
                  min="5"
                  step="1"
                  className={styles.formInput}
                  placeholder="25"
                />
              </div>
              <p className={styles.formHelp}>Minimum prize amount is $5</p>
            </div>
          </div>

          {/* Winner Selection - Commented out for automated only */}
          {/* <div className={styles.formSection}>
            <h3>
              <FaUsers style={{ marginRight: '8px' }} />
              Winner Selection
            </h3>

            <div className={styles.formGroup}>
              <label>How should the winner be selected?</label>
              <div className={styles.radioGroup}>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="winner_selection_method"
                    value="automated"
                    checked={formData.winner_selection_method === 'automated'}
                    onChange={handleInputChange}
                  />
                  <div className={styles.radioContent}>
                    <strong>Automated Selection</strong>
                    <p>Winner is selected based on community engagement metrics</p>
                  </div>
                </label>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="winner_selection_method"
                    value="curated"
                    checked={formData.winner_selection_method === 'curated'}
                    onChange={handleInputChange}
                  />
                  <div className={styles.radioContent}>
                    <strong>Curated Selection</strong>
                    <p>You manually review and select the best entry</p>
                  </div>
                </label>

              </div>
            </div>
          </div> */}

          {/* Additional Options */}
          <div className={styles.formSection}>
            <h3>
              <FaClock style={{ marginRight: '8px' }} />
              Additional Options
            </h3>
            
            <div className={styles.formGroup}>
              <label className={styles.checkboxOption}>
                <input
                  type="checkbox"
                  name="pinned"
                  checked={formData.pinned}
                  onChange={handleInputChange}
                />
                <div className={styles.checkboxContent}>
                  <strong>Pin Competition</strong>
                  <p>Feature this competition prominently on the competitions page (+$25)</p>
                </div>
              </label>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="voucher_code">Voucher Code (Optional)</label>
              <input
                type="text"
                id="voucher_code"
                name="voucher_code"
                value={formData.voucher_code}
                onChange={handleInputChange}
                className={styles.formInput}
                placeholder="Enter voucher code if you have one"
              />
            </div>
          </div>

          {/* Fee Breakdown */}
          {formData.prize_amount && (
            <div className={styles.feeBreakdown}>
              <h4>Fee Breakdown</h4>
              <div className={styles.feeItem}>
                <span>Prize Amount:</span>
                <span>${fees.prizeAmount}</span>
              </div>
              <div className={styles.feeItem}>
                <span>Platform Fee (15%):</span>
                <span>${fees.platformFee}</span>
              </div>
              {formData.pinned && (
                <div className={styles.feeItem}>
                  <span>Pinning Fee:</span>
                  <span>${fees.pinningFee}</span>
                </div>
              )}
              <div className={styles.feeTotal}>
                <span><strong>Total:</strong></span>
                <span><strong>${fees.totalFee}</strong></span>
              </div>
            </div>
          )}

          {/* Error and Success Messages */}
          {error && (
            <div className={styles.errorMessage}>
              <FaExclamationTriangle style={{ marginRight: '8px' }} />
              {error}
            </div>
          )}
          
          {success && (
            <div className={styles.successMessage}>
              <FaCheckCircle style={{ marginRight: '8px' }} />
              {success}
            </div>
          )}

          {/* Submit Button */}
          <div className={styles.formActions}>
            <button
              type="button"
              onClick={() => router.back()}
              className="pill-btn"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pill-btn gradient-btn"
              disabled={isLoading || !formData.track_id}
            >
              {isLoading ? 'Creating...' : 'Create Competition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CreateCompetition() {
  return (
    <Suspense fallback={
      <div className={styles.competitionCreateContainer}>
        <div className="about-header">
          <h1 className="about-title">Create Competition</h1>
          <p className="about-subtitle">Host a competition to inspire collaboration and creativity</p>
        </div>
        <div className="loading-spinner">
          <div className="spinner-icon">⟳</div>
          Loading...
        </div>
      </div>
    }>
      <CreateCompetitionClient />
    </Suspense>
  );
}
