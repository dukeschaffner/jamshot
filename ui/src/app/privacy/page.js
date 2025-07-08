'use client';
import { FaShieldAlt, FaLock, FaDatabase, FaUsers, FaEnvelope, FaEye } from 'react-icons/fa';
import styles from '../../styles/Legal.module.css';

export default function PrivacyPolicyPage() {
  return (
    <div className={`${styles.privacyPolicyPage} container mx-auto py-8 px-4`}>
      <div className="text-center mb-12">
        <div className="privacy-notice-icon">
          <FaShieldAlt />
        </div>
        <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-secondary">
          Your privacy is important to us. This policy explains how we collect, use, and protect your information.
        </p>
        <p className="text-sm text-secondary mt-2">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-8">
        
        <section className={styles.privacySection}>
          <h2 className="section-title flex items-center">
            <FaDatabase className="mr-3 text-seafoam" />
            Information We Collect
          </h2>
          <div className={styles.sectionContent}>
            <h3>Personal Information</h3>
            <ul>
              <li><strong>Account Information:</strong> Username, email address, full name, and profile picture</li>
              <li><strong>Profile Information:</strong> Bio, social media links, and other profile details you choose to share</li>
              <li><strong>Communication:</strong> Messages you send through our contact forms or support channels</li>
            </ul>
            
            <h3>Content Information</h3>
            <ul>
              <li><strong>Audio Files:</strong> Music tracks, collaborations, and audio content you upload</li>
              <li><strong>Metadata:</strong> Track titles, descriptions, tags, and collaboration information</li>
              <li><strong>Interactions:</strong> Likes, comments, reposts, and collaboration activities</li>
            </ul>
            
            <h3>Technical Information</h3>
            <ul>
              <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, and time spent on the platform</li>
              <li><strong>Analytics:</strong> Aggregated usage statistics and performance metrics</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title flex items-center">
            <FaEye className="mr-3 text-seafoam" />
            How We Use Your Information
          </h2>
          <div className={styles.sectionContent}>
            <h3>Platform Services</h3>
            <ul>
              <li>Provide and maintain the Sterio platform and its features</li>
              <li>Enable music collaboration and sharing between users</li>
              <li>Process and store your audio content and collaborations</li>
              <li>Manage your account and profile information</li>
            </ul>
            
            <h3>Communication</h3>
            <ul>
              <li>Send important updates about your account and the platform</li>
              <li>Respond to your support requests and inquiries</li>
              <li>Notify you about new collaborations, likes, and comments</li>
              <li>Share platform news and feature announcements (with your consent)</li>
            </ul>
            
            <h3>Improvement and Analytics</h3>
            <ul>
              <li>Analyze usage patterns to improve our services</li>
              <li>Develop new features and enhance existing ones</li>
              <li>Monitor platform performance and security</li>
              <li>Generate aggregated, anonymous statistics</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title flex items-center">
            <FaUsers className="mr-3 text-seafoam" />
            Information Sharing
          </h2>
          <div className={styles.sectionContent}>
            <h3>Public Information</h3>
            <p>The following information is public by default:</p>
            <ul>
              <li>Your username, profile picture, and bio</li>
              <li>Public tracks and collaborations you upload</li>
              <li>Your likes, comments, and reposts on public content</li>
              <li>Your follower and following counts</li>
            </ul>
            
            <h3>Private Information</h3>
            <p>We do not share your private information except:</p>
            <ul>
              <li><strong>With your consent:</strong> When you explicitly authorize sharing</li>
              <li><strong>Service providers:</strong> Third-party services that help us operate the platform (under strict confidentiality agreements)</li>
              <li><strong>Legal requirements:</strong> When required by law or to protect our rights and users&apos; safety</li>
              <li><strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of assets</li>
            </ul>
            
            <h3>Collaboration Partners</h3>
            <p>When you collaborate on tracks:</p>
            <ul>
              <li>All collaborators can see the track and its metadata</li>
              <li>Collaboration history is visible to all participants</li>
              <li>Attribution information is shared with all collaborators</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title flex items-center">
            <FaLock className="mr-3 text-seafoam" />
            Data Security
          </h2>
          <div className={styles.sectionContent}>
            <h3>Security Measures</h3>
            <ul>
              <li><strong>Encryption:</strong> All data is encrypted in transit and at rest</li>
              <li><strong>Access Controls:</strong> Strict access controls and authentication requirements</li>
              <li><strong>Regular Audits:</strong> Security audits and vulnerability assessments</li>
              <li><strong>Secure Infrastructure:</strong> Industry-standard cloud security practices</li>
            </ul>
            
            <h3>Your Security</h3>
            <ul>
              <li>Use a strong, unique password for your account</li>
              <li>Keep your login credentials confidential</li>
              <li>Log out from shared or public devices</li>
              <li>Report any suspicious activity immediately</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Your Rights and Choices</h2>
          <div className={styles.sectionContent}>
            <h3>Account Control</h3>
            <ul>
              <li><strong>Access:</strong> View and download your personal information</li>
              <li><strong>Update:</strong> Modify your profile and account settings</li>
              <li><strong>Delete:</strong> Request deletion of your account and data</li>
              <li><strong>Privacy Settings:</strong> Control who can see your content and profile</li>
            </ul>
            
            <h3>Content Control</h3>
            <ul>
              <li><strong>Upload Control:</strong> Choose what content to share</li>
              <li><strong>Privacy Settings:</strong> Make tracks private or public</li>
              <li><strong>Collaboration Control:</strong> Choose who can collaborate with you</li>
              <li><strong>Deletion:</strong> Delete your tracks and content</li>
            </ul>
            
            <h3>Communication Preferences</h3>
            <ul>
              <li>Manage notification settings in your account preferences</li>
              <li>Opt out of promotional emails</li>
              <li>Control collaboration and interaction notifications</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Data Retention</h2>
          <div className={styles.sectionContent}>
            <h3>Account Data</h3>
            <p>We retain your account information for as long as your account is active or as needed to provide services.</p>
            
            <h3>Content Data</h3>
            <p>Your uploaded content is retained according to these guidelines:</p>
            <ul>
              <li><strong>Active Content:</strong> Retained while your account is active</li>
              <li><strong>Collaborated Content:</strong> May be retained longer due to collaboration relationships</li>
              <li><strong>Deleted Content:</strong> Permanently deleted within 30 days of deletion request</li>
            </ul>
            
            <h3>Legal Requirements</h3>
            <p>Some data may be retained longer to comply with legal obligations or resolve disputes.</p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Third-Party Services</h2>
          <div className={styles.sectionContent}>
            <h3>Service Providers</h3>
            <p>We use trusted third-party services for:</p>
            <ul>
              <li><strong>Cloud Storage:</strong> Amazon Web Services (AWS) for data storage</li>
              <li><strong>Analytics:</strong> Google Analytics for usage analytics</li>
              <li><strong>Payments:</strong> Stripe for payment processing</li>
              <li><strong>Email:</strong> Email service providers for notifications</li>
            </ul>
            
            <h3>External Links</h3>
            <p>Our platform may contain links to external websites. We are not responsible for the privacy practices of these sites.</p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">International Users</h2>
          <div className={styles.sectionContent}>
            <p>Sterio is operated from the United States. If you are accessing our service from outside the US, please be aware that your information may be transferred to, stored, and processed in the United States.</p>
            
            <h3>GDPR Compliance</h3>
            <p>For users in the European Union, we comply with GDPR requirements:</p>
            <ul>
              <li>Legal basis for processing your data</li>
              <li>Right to access, rectify, and erase your data</li>
              <li>Right to data portability</li>
              <li>Right to object to processing</li>
            </ul>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Children&apos;s Privacy</h2>
          <div className={styles.sectionContent}>
            <p>Sterio is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have collected information from a child under 13, please contact us immediately.</p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title">Changes to This Policy</h2>
          <div className={styles.sectionContent}>
            <p>We may update this privacy policy from time to time. We will notify you of any changes by:</p>
            <ul>
              <li>Posting the new policy on this page</li>
              <li>Updating the &quot;Last updated&quot; date</li>
              <li>Sending you an email notification for significant changes</li>
            </ul>
            <p>Your continued use of Sterio after any changes indicates your acceptance of the updated policy.</p>
          </div>
        </section>

        <section className={styles.privacySection}>
          <h2 className="section-title flex items-center">
            <FaEnvelope className="mr-3 text-seafoam" />
            Contact Us
          </h2>
          <div className={styles.sectionContent}>
            <p>If you have any questions about this Privacy Policy or our privacy practices, please <a href="/contact" className="text-seafoam hover:underline">contact us</a></p>
            <p>We will respond to your inquiry within 30 days.</p>
          </div>
        </section>

      </div>
    </div>
  );
} 