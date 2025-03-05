'use client';
import { useState } from 'react';
import { FaHeart, FaPaypal, FaBitcoin, FaPatreon, FaGithub, FaTwitter, FaInstagram } from 'react-icons/fa';
import Link from 'next/link';

export default function About() {
  const [donationAmount, setDonationAmount] = useState(5);
  
  const handleDonationChange = (e) => {
    setDonationAmount(parseInt(e.target.value, 10));
  };
  
  return (
    <div className="about-container">
      <div className="about-header">
        <h1 className="about-title">About JamShot</h1>
        <p className="about-subtitle">Empowering musicians to collaborate and create together</p>
      </div>
      
      <div className="about-content">
        <section className="vision-section">
          <h2 className="section-title">Our Vision</h2>
          <div className="vision-text">
            <p>
              JamShot was born from a simple idea: <strong>music is better when created together</strong>. 
              As a musician myself, I&apos;ve experienced the magic that happens when artists collaborate, 
              bringing different perspectives, skills, and ideas to the creative process.
            </p>
            <p>
              In today&apos;s digital world, musicians are often separated by distance, but that shouldn&apos;t 
              limit our ability to create together. JamShot bridges this gap by providing a platform 
              where musicians can share their work, find collaborators, and build upon each other&apos;s 
              creativity in a seamless, intuitive way.
            </p>
            <p>
              Our platform is designed to foster a community where artists can:
            </p>
            <ul className="vision-list">
              <li>Share tracks and invite specific collaborations</li>
              <li>Discover new artists with complementary styles</li>
              <li>Build upon existing tracks with new layers and ideas</li>
              <li>Maintain creative control while embracing collaborative input</li>
              <li>Receive fair recognition and compensation for their contributions</li>
            </ul>
            <p>
              We believe that the future of music lies in breaking down the barriers between artists 
              and creating new pathways for collaborative creation. JamShot isn&apos;t just a platform—it&apos;s 
              a movement toward a more connected, collaborative musical ecosystem.
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
                <a href="#" className="payment-btn paypal-btn">
                  <FaPaypal /> Donate with PayPal
                </a>
                <a href="#" className="payment-btn patreon-btn">
                  <FaPatreon /> Become a Patron
                </a>
                <a href="#" className="payment-btn crypto-btn">
                  <FaBitcoin /> Donate Crypto
                </a>
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