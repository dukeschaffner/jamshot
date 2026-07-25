'use client';
import { FaGavel, FaMusic, FaUserShield, FaExclamationTriangle, FaEnvelope, FaBalanceScale } from 'react-icons/fa';
import styles from '@/styles/Legal.module.css';

export default function TermsOfServicePage() {
  return (
    <div className={`${styles.termsOfServicePage} container mx-auto py-8 px-4`}>
      <div className="text-center mb-12">
        <div className="privacy-notice-icon">
          <FaGavel />
        </div>
        <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
        <p className="text-secondary">
          Please read these terms carefully before using Sterio. By using our service, you agree to these terms.
        </p>
        <p className="text-sm text-secondary mt-2">
          Last updated: March 2, 2025
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-8">
        
        <section className={styles.privacySection}>
          <h2 className="section-title">Acceptance of Terms</h2>
          <div className={styles.sectionContent}>
            <p>By accessing and using Sterio (&quot;the Service&quot;), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.</p>
            
            <p>These Terms of Service (&quot;Terms&quot;) govern your access to and use of Sterio, including any content, functionality, and services offered on or through the platform.</p>
            
            <p>We reserve the right to update and change these Terms at any time without notice. Your continued use of the Service following any changes indicates your acceptance of the new Terms.</p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Description of Service</h2>
          <div className={styles.sectionContent}>
            <p>Sterio is a music collaboration platform that allows users to:</p>
            <ul>
              <li>Upload and share original music tracks</li>
              <li>Collaborate with other musicians by adding to existing tracks</li>
              <li>Discover new music and artists</li>
              <li>Build a community around music creation and sharing</li>
              <li>Interact with content through likes, comments, and reposts</li>
            </ul>
            
            <p>The Service is provided &quot;as is&quot; and we reserve the right to modify, suspend, or discontinue any part of the Service at any time.</p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">User Accounts</h2>
          <div className={styles.sectionContent}>
            <h3>Account Registration</h3>
            <ul>
              <li>You must be at least 13 years old to create an account</li>
              <li>You must provide accurate and complete information</li>
              <li>You are responsible for maintaining the security of your account</li>
              <li>You must not share your account credentials with others</li>
              <li>One person or entity may not maintain more than one account</li>
            </ul>
            
            <h3>Account Responsibilities</h3>
            <ul>
              <li>You are responsible for all activities under your account</li>
              <li>You must notify us immediately of any unauthorized use</li>
              <li>You must keep your contact information current</li>
              <li>You must comply with all applicable laws and regulations</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title flex items-center">
            <FaMusic className="mr-3 text-seafoam" />
            Content and Intellectual Property
          </h2>
          <div className={styles.sectionContent}>
            <h3>Your Content</h3>
            <p>You retain all rights to the original content you create and upload to Sterio. However, by uploading content, you grant us a non-exclusive, irrevocable, worldwide, royalty-free, sublicensable license to:</p>
            <ul>
              <li>Host, stream, publicly perform, use, display, and distribute your content</li>
              <li>Remix or create derivative works from your content in accordance with the Service&apos;s features and these Terms</li>
              <li>Make your content available to other users for collaboration</li>
              <li>Promote your content on and off the platform, including in marketing and promotional materials</li>
            </ul>
            <p>This license does not entitle you to any compensation unless we have explicitly agreed in writing to compensate you.</p>
            
            <h3>Stream Events</h3>
            <p>When you participate in Sterio events (including livestreams), you grant Sterio and its users the rights above, and additionally you grant Sterio the right to:</p>
            <ul>
              <li>Live stream your content as part of the event</li>
              <li>Record the livestream and create clips or highlights</li>
              <li>Use those recordings and clips for promotional purposes (e.g., social media, marketing, recap content)</li>
            </ul>
            <p>By uploading to an event track, you also grant other Sterio users a license to use your content for mixing and creation within the Service as permitted by the event. Participation in events does not entitle you to compensation unless we have explicitly agreed in writing.</p>
            
            <h3>Collaboration Rights</h3>
            <p>When you collaborate on tracks:</p>
            <ul>
              <li>You grant other collaborators the right to use your contributions</li>
              <li>You receive rights to use other collaborators&apos; contributions</li>
              <li>All collaborators share attribution rights</li>
              <li>The original creator maintains primary ownership</li>
            </ul>
            
            <h3>Content Guidelines</h3>
            <p>All content must:</p>
            <ul>
              <li>Be original or properly licensed</li>
              <li>Not infringe on others&apos; intellectual property rights</li>
              <li>Not contain illegal or harmful material</li>
              <li>Comply with the content standards set out in these Terms</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title flex items-center">
            <FaUserShield className="mr-3 text-seafoam" />
            User Conduct
          </h2>
          <div className={styles.sectionContent}>
            <h3>Acceptable Use</h3>
            <p>You agree to use Sterio only for lawful purposes and in accordance with these Terms. You agree not to:</p>
            <ul>
              <li>Upload content that infringes on others&apos; rights</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Spam or send unsolicited messages</li>
              <li>Attempt to gain unauthorized access to the Service</li>
              <li>Use the Service for any illegal activities</li>
              <li>Impersonate others or create fake accounts</li>
              <li>Interfere with the proper functioning of the Service</li>
            </ul>
            
            <h3>Content Standards</h3>
            <p>We strive to maintain a positive community. Content that violates these standards includes:</p>
            <ul>
              <li>Hate speech or discriminatory content</li>
              <li>Explicit sexual content</li>
              <li>Violence or threats</li>
              <li>Spam or repetitive content</li>
              <li>Copyright-infringing material</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Privacy and Data Protection</h2>
          <div className={styles.sectionContent}>
            <p>Your privacy is important to us. Our use of your personal information is governed by our Privacy Policy, which is incorporated into these Terms by reference.</p>
            
            <h3>Data Collection</h3>
            <ul>
              <li>We collect information you provide directly to us</li>
              <li>We collect information about your use of the Service</li>
              <li>We may collect information from third-party sources</li>
            </ul>
            
            <h3>Data Use</h3>
            <ul>
              <li>We use your data to provide and improve the Service</li>
              <li>We may use your data for analytics and research</li>
              <li>We will not sell your personal information to third parties</li>
            </ul>
            
            <p>For complete details, please review our <a href="/privacy" className="text-seafoam hover:underline">Privacy Policy</a>.</p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Payment and Subscription Terms</h2>
          <div className={styles.sectionContent}>
            <h3>Free Service</h3>
            <p>Sterio currently offers its basic services free of charge. We reserve the right to introduce paid features or subscription plans in the future.</p>
            
            <h3>Donations</h3>
            <ul>
              <li>Donations are voluntary and non-refundable</li>
              <li>Donations do not grant additional rights or privileges</li>
              <li>We may recognize supporters with special badges or features</li>
            </ul>
            
            <h3>Future Paid Features</h3>
            <p>If we introduce paid features:</p>
            <ul>
              <li>We will provide clear notice of any changes</li>
              <li>Existing free features will remain free</li>
              <li>Payment terms will be clearly disclosed</li>
              <li>Subscriptions may be subject to additional terms</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title flex items-center">
            <FaExclamationTriangle className="mr-3 text-seafoam" />
            Disclaimers and Limitations
          </h2>
          <div className={styles.sectionContent}>
            <h3>Service Availability</h3>
            <ul>
              <li>The Service is provided &quot;as is&quot; without warranties</li>
              <li>We do not guarantee uninterrupted or error-free service</li>
              <li>We may suspend or terminate the Service at any time</li>
              <li>We are not responsible for content uploaded by users</li>
            </ul>
            
            <h3>Limitation of Liability</h3>
            <p>To the maximum extent permitted by law:</p>
            <ul>
              <li>We are not liable for any indirect, incidental, or consequential damages</li>
              <li>Our total liability will not exceed $100 or the amount you paid us in the last 12 months</li>
              <li>We are not responsible for user-generated content</li>
              <li>We are not liable for actions of other users</li>
            </ul>
            
            <h3>Indemnification</h3>
            <p>You agree to indemnify and hold us harmless from any claims, damages, or expenses arising from:</p>
            <ul>
              <li>Your use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your infringement of others&apos; rights</li>
              <li>Content you upload or share</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Copyright and DMCA</h2>
          <div className={styles.sectionContent}>
            <h3>Copyright Policy</h3>
            <p>We respect intellectual property rights and expect our users to do the same. We will respond to valid copyright infringement claims in accordance with the Digital Millennium Copyright Act (DMCA).</p>
            
            <h3>DMCA Notice</h3>
            <p>If you believe your copyrighted work has been infringed, please provide:</p>
            <ul>
              <li>A physical or electronic signature of the copyright owner</li>
              <li>Identification of the copyrighted work</li>
              <li>Identification of the infringing material</li>
              <li>Your contact information</li>
              <li>A statement of good faith belief</li>
              <li>A statement of accuracy under penalty of perjury</li>
            </ul>
            
            <h3>Counter-Notice</h3>
            <p>If your content was removed due to a DMCA claim and you believe it was removed in error, you may file a counter-notice.</p>
            
            <p>Send DMCA notices <a href="/contact" className="text-seafoam hover:underline">here</a></p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Termination</h2>
          <div className={styles.sectionContent}>
            <h3>Termination by You</h3>
            <ul>
              <li>You may terminate your account at any time</li>
              <li>You can delete your account through your settings</li>
              <li>Some information may be retained as required by law</li>
            </ul>
            
            <h3>Termination by Us</h3>
            <p>We may terminate or suspend your account if:</p>
            <ul>
              <li>You violate these Terms</li>
              <li>You engage in illegal activities</li>
              <li>You create multiple accounts</li>
              <li>You abuse the Service or other users</li>
              <li>We determine termination is necessary</li>
            </ul>
            
            <h3>Effect of Termination</h3>
            <ul>
              <li>Your right to use the Service will end immediately</li>
              <li>We may delete your account and content</li>
              <li>Some provisions of these Terms will survive termination</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Governing Law</h2>
          <div className={styles.sectionContent}>
            <h3>Governing Law</h3>
            <p>These Terms are governed by the laws of the United States, without regard to conflict of law principles.</p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Changes to Terms</h2>
          <div className={styles.sectionContent}>
            <h3>Changes to Terms</h3>
            <p>We may update these Terms from time to time. Any changes will be effective immediately upon posting the updated Terms on the Service. Your continued use of the Service following any changes indicates your acceptance of the new Terms.</p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title flex items-center">
            <FaEnvelope className="mr-3 text-seafoam" />
            Contact Information
          </h2>
          <div className={styles.sectionContent}>
            <p>If you have any questions about these Terms of Service, please <a href="/contact" className="text-seafoam hover:underline">contact us</a></p>
            <p>We will respond to your inquiry within 30 days.</p>
          </div>
        </section>

      </div>
    </div>
  );
} 