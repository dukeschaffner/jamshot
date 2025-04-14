'use client';
import { useState, useEffect, Suspense } from 'react';
import { FaHeart, FaPatreon, FaBitcoin, FaGithub, FaTwitter, FaInstagram, FaStripe } from 'react-icons/fa';
import { loadStripe } from '@stripe/stripe-js';
import Link from 'next/link';
import api from '../../lib/api';
import { useSearchParams } from 'next/navigation';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// Component that uses useSearchParams
function AboutContent() {
  const [donationAmount, setDonationAmount] = useState(5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // Check for payment status in URL
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      setPaymentStatus('success');
    } else if (payment === 'canceled') {
      setPaymentStatus('canceled');
    }
  }, [searchParams]);
  
  const handleDonationChange = (e) => {
    setDonationAmount(parseInt(e.target.value, 10));
  };
  
  const handleStripeCheckout = async () => {
    try {
      setIsProcessing(true);
      
      // Get the Stripe checkout session from our API
      const response = await api.post(`/payments/create-checkout-session`, {
        amount: donationAmount
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Redirect to Stripe Checkout
       window.location.href = response.data.url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      setPaymentStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <div className="about-container">
      <div className="about-header">
        <h1 className="about-title">About JamShot</h1>
        <p className="about-subtitle">Empowering musicians to collaborate and create together</p>
      </div>
      
      {paymentStatus === 'success' && (
        <div className="payment-status success">
          <h3>Thank you for your support!</h3>
          <p>Your donation helps us continue to build and improve JamShot for musicians everywhere.</p>
        </div>
      )}
      
      {paymentStatus === 'canceled' && (
        <div className="payment-status canceled">
          <p>Your payment was canceled. If you&apos;d like to try again, please select an amount below.</p>
        </div>
      )}
      
      {paymentStatus === 'error' && (
        <div className="payment-status error">
          <p>There was an error processing your payment. Please try again later.</p>
        </div>
      )}
      
      <div className="about-content">
        <section className="vision-section">
          <h2 className="section-title">Our Vision</h2>
          <div className="vision-text">
            <p>
              JamShot was born from a simple idea: <strong>redefine the way we share music</strong>. 
              As a musician myself, I&apos;ve experienced the magic that happens when artists collaborate, 
              bringing different perspectives, skills, and ideas to the creative process.
            </p>
            <p>
              The music industry has struggled with effective collaboration tools. Traditional online 
              collaborative DAWs require extensive setup, where you must first find potential collaborators, 
              create and configure a new project, and then often face the awkwardness of starting with 
              no initial ideas or natural inspiration. This formal, structured approach removes the spontaneity 
              and natural flow that makes in-person jam sessions so creative and productive. JamShot eliminates 
              these barriers by creating a space where collaboration happens organically, driven by the music itself.
            </p>
            <p>
              In today&apos;s digital world, musicians are often separated by distance, but that shouldn&apos;t 
              limit our ability to create together. JamShot bridges this gap by providing a platform 
              where musicians can freely share their work, find collaborators, and build upon each other&apos;s 
              creativity in a seamless, intuitive way.
            </p>
            <p>
              Our mission is to unlock a new era of musical collaboration. We&apos;re making this possible by:
            </p>
            <ul className="vision-list">
              <li><strong>Empowering open sharing</strong> — Whether it&apos;s a polished track or just a cool loop you made last night, share it all. Our dynamic feed keeps you connected with what your friends and favorite artists are creating right now.</li>
              <li><strong>Breaking down collaboration barriers</strong> — Collaborate with ANYONE on the platform, anytime. No more waiting for the perfect opportunity or watching online DAW projects fizzle out after a week.</li>
              <li><strong>Simplifying music creation</strong> — We&apos;re removing technical barriers so that your only limit is your imagination. Making and sharing music should be intuitive for everyone, from beginners to professionals.</li>
            </ul>
            <p>
              JamShot is pioneering a first-of-its-kind social media platform for music, where instead of sharing text-based
              posts and comments, you can share your ideas or comments through music,
              creating a dynamic ecosystem of sound and creativity.
            </p>
            <p>
              We believe the future of music lies in open connection and collaboration. JamShot isn&apos;t just a platform—it&apos;s 
              a movement toward a more vibrant, inclusive musical community where every artist can find their voice 
              and their perfect collaborators.
            </p>
            <p className="join-cta">
              Ready to transform the way you create? <strong>Join JamShot today</strong> and become part of the collaborative music revolution.
            </p>
          </div>
        </section>
        
        <section className="features-section">
          <h2 className="section-title">Key Features</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon collab-icon"></div>
              <h3>Track Collaboration</h3>
              <p>Build upon existing tracks by adding new instruments, vocals, or production elements</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon discover-icon"></div>
              <h3>Artist Discovery</h3>
              <p>Find musicians with complementary skills and styles to enhance your creative projects</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon rights-icon"></div>
              <h3>Rights Management</h3>
              <p>Clear attribution and rights management for all collaborators on a track</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon community-icon"></div>
              <h3>Supportive Community</h3>
              <p>Connect with like-minded artists who share your passion for musical innovation</p>
            </div>
          </div>
        </section>
        
        <section className="support-section">
          <h2 className="section-title">Support JamShot</h2>
          <p className="support-text">
            JamShot is a passion project created to support independent musicians. Your donations 
            help us maintain the platform, develop new features, and keep the service accessible 
            to artists everywhere.
          </p>
          
          <div className="donation-container">
            <div className="donation-options">
              <h3>Choose an amount</h3>
              <div className="amount-buttons">
                <button 
                  className={`amount-btn ${donationAmount === 5 ? 'active' : ''}`}
                  onClick={() => setDonationAmount(5)}
                >
                  $5
                </button>
                <button 
                  className={`amount-btn ${donationAmount === 10 ? 'active' : ''}`}
                  onClick={() => setDonationAmount(10)}
                >
                  $10
                </button>
                <button 
                  className={`amount-btn ${donationAmount === 25 ? 'active' : ''}`}
                  onClick={() => setDonationAmount(25)}
                >
                  $25
                </button>
                <button 
                  className={`amount-btn ${donationAmount === 50 ? 'active' : ''}`}
                  onClick={() => setDonationAmount(50)}
                >
                  $50
                </button>
                <button 
                  className={`amount-btn ${donationAmount === 100 ? 'active' : ''}`}
                  onClick={() => setDonationAmount(100)}
                >
                  $100
                </button>
              </div>
              <div className="custom-amount">
                <label htmlFor="custom-amount">Or enter a custom amount:</label>
                <div className="custom-input">
                  <span>$</span>
                  <input 
                    type="number" 
                    id="custom-amount" 
                    min="1" 
                    value={donationAmount} 
                    onChange={handleDonationChange} 
                  />
                </div>
              </div>
            </div>
            
            <div className="payment-methods">
              <h3>Payment methods</h3>
              <div className="payment-buttons">
                <button 
                  className="payment-btn stripe-btn"
                  onClick={handleStripeCheckout}
                  disabled={isProcessing}
                >
                  <FaStripe /> {isProcessing ? 'Processing...' : 'Donate with Stripe'}
                </button>
                {/* <a href="#" className="payment-btn patreon-btn">
                  <FaPatreon /> Become a Patron
                </a>
                <a href="#" className="payment-btn crypto-btn">
                  <FaBitcoin /> Donate Crypto
                </a> */}
              </div>
            </div>
          </div>
          
          <div className="supporter-benefits">
            <h3><FaHeart /> Supporter Benefits</h3>
            <ul>
              <li>Early access to new features</li>
              <li>Supporter badge on your profile</li>
              <li>Priority support</li>
              <li>Influence on future development</li>
              <li>Our eternal gratitude!</li>
            </ul>
          </div>
        </section>
        
        <section className="team-section">
          <h2 className="section-title">Meet the Creator</h2>
          <div className="creator-profile">
            <div className="creator-image"></div>
            <div className="creator-info">
              <h3>Duke Schaffner</h3>
              <p className="creator-title">Founder & Developer</p>
              <p className="creator-bio">
                Musician, developer, and passionate advocate for collaborative creation. 
                I built JamShot to solve problems I faced as an independent artist looking 
                to collaborate with others.
              </p>
              <div className="creator-social">
                <a href="#" className="social-link"><FaGithub /></a>
                <a href="#" className="social-link"><FaTwitter /></a>
                <a href="#" className="social-link"><FaInstagram /></a>
              </div>
            </div>
          </div>
        </section>
        
        <section className="contact-section">
          <h2 className="section-title">Get in Touch</h2>
          <p>
            Have questions, suggestions, or just want to say hello? We&apos;d love to hear from you!
          </p>
          <Link href="/contact" className="contact-btn">
            Contact Us
          </Link>
        </section>
      </div>
    </div>
  );
}

// Main page component with Suspense
export default function About() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    }>
      <AboutContent />
    </Suspense>
  );
} 