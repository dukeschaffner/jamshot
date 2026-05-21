'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FaChevronDown, FaChevronRight } from 'react-icons/fa';
import styles from './Help.module.css';
import HowToUseOwnDAW from './articles/HowToUseOwnDAW';
import HowToAllowAudioAccess from './articles/HowToAllowAudioAccess';
import SterioPlugin from './articles/SterioPlugin';
import DAWBestPractices from './articles/DAWBestPractices';

// Feature and article data structure
const helpData = {
  'DAW': {
    expanded: false,
    articles: [
      {
        id: 'sterio-plugin',
        title: 'Sterio Plugin',
        component: SterioPlugin
      },
      {
        id: 'daw-best-practices',
        title: 'DAW Best Practices',
        component: DAWBestPractices
      },
      {
        id: 'how-to-use-own-daw',
        title: 'How to use audio from your own DAW',
        component: HowToUseOwnDAW
      },
      {
        id: 'how-to-allow-audio-access',
        title: 'How to allow audio access',
        component: HowToAllowAudioAccess
      }
    ]
  },
//   'Teams': {
//     expanded: false,
//     articles: []
//   },
//   'Camps': {
//     expanded: false,
//     articles: []
//   }
};

function HelpContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [expandedFeatures, setExpandedFeatures] = useState({});
  const [selectedArticle, setSelectedArticle] = useState(null);

  // Initialize expanded state from URL
  useEffect(() => {
    const articleParam = searchParams.get('article');
    if (articleParam) {
      // Find which feature contains this article
      for (const [featureName, featureData] of Object.entries(helpData)) {
        const article = featureData.articles.find(a => a.id === articleParam);
        if (article) {
          setExpandedFeatures({ [featureName]: true });
          setSelectedArticle(article);
          return;
        }
      }
    }
    
    // Default: expand DAW and select first article if no article param
    if (!articleParam && helpData['DAW'].articles.length > 0) {
      setExpandedFeatures({ 'DAW': true });
      setSelectedArticle(helpData['DAW'].articles[0]);
      router.replace('/help?article=sterio-plugin', { scroll: false });
    }
  }, [searchParams, router]);

  const toggleFeature = (featureName) => {
    setExpandedFeatures(prev => ({
      ...prev,
      [featureName]: !prev[featureName]
    }));
  };

  const selectArticle = (article) => {
    setSelectedArticle(article);
    router.push(`/help?article=${article.id}`, { scroll: false });
  };

  const renderArticle = () => {
    if (!selectedArticle) {
      return (
        <div className={styles.emptyState}>
          <h2>Welcome to Help</h2>
          <p>Select an article from the sidebar to get started.</p>
        </div>
      );
    }

    const ArticleComponent = selectedArticle.component;
    return (
      <div className={styles.articleContent}>
        <ArticleComponent />
      </div>
    );
  };

  return (
    <div className={styles.helpContainer}>
      <div className={styles.helpHeader}>
        <h1 className={styles.helpTitle}>Help Center</h1>
        <p className={styles.helpSubtitle}>Learn how to use Sterio&apos;s features</p>
      </div>

      <div className={styles.helpLayout}>
        <aside className={styles.sidebar}>
          <nav className={styles.sidebarNav}>
            {Object.entries(helpData).map(([featureName, featureData]) => (
              <div key={featureName} className={styles.featureSection}>
                <button
                  className={styles.featureButton}
                  onClick={() => toggleFeature(featureName)}
                  aria-expanded={expandedFeatures[featureName] || false}
                >
                  <span className={styles.featureIcon}>
                    {expandedFeatures[featureName] ? (
                      <FaChevronDown />
                    ) : (
                      <FaChevronRight />
                    )}
                  </span>
                  <span className={styles.featureName}>{featureName}</span>
                </button>
                {expandedFeatures[featureName] && featureData.articles.length > 0 && (
                  <ul className={styles.articleList}>
                    {featureData.articles.map((article) => (
                      <li key={article.id}>
                        <button
                          className={`${styles.articleLink} ${
                            selectedArticle?.id === article.id ? styles.active : ''
                          }`}
                          onClick={() => selectArticle(article)}
                        >
                          {article.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <main className={styles.articleArea}>
          {renderArticle()}
        </main>
      </div>
    </div>
  );
}

export default function Help() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    }>
      <HelpContent />
    </Suspense>
  );
}

