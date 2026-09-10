import Link from 'next/link';
import HtmlEmbed from '@/components/marketing/HtmlEmbed';
import MarketingAuthAction from '@/components/marketing/MarketingAuthAction';
import styles from '../MarketingSite.module.css';

function ArticleSection({ section }) {
  if (section.type === 'heading') {
    return <h2>{section.heading}</h2>;
  }

  if (section.type === 'callout') {
    return (
      <div className={styles.articleCallout}>
        {section.heading && <h2>{section.heading}</h2>}
        {section.children}
        {section.buttonLabel && section.buttonHref && (
          <MarketingAuthAction
            action={{
              label: section.buttonLabel,
              href: section.buttonHref,
              variant: 'primary',
            }}
          />
        )}
      </div>
    );
  }

  if (section.type === 'html') {
    return <HtmlEmbed html={section.html} caption={section.caption} />;
  }

  return section.children;
}

export default function MarketingArticle({
  backHref = '/guides',
  backLabel = 'Back to Guides',
  meta,
  headline,
  intro,
  sections = [],
}) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <article className={`${styles.articleLayout} ${styles.sectionPad}`}>
      <header className={`${styles.articleHeader} ${reveal}`} data-reveal>
        <Link className={styles.textLink} href={backHref}>
          {backLabel}
        </Link>
        {meta && <p className={styles.guideMeta}>{meta}</p>}
        <h1>{headline}</h1>
        {intro}
      </header>
      <div className={`${styles.articleBody} ${reveal}`} data-reveal>
        {sections.map((section, index) => (
          <ArticleSection key={section.key || index} section={section} />
        ))}
      </div>
    </article>
  );
}

export function MarketingArticleBody({ sections = [] }) {
  const reveal = `${styles.reveal} marketing-reveal`;

  return (
    <div className={`${styles.articleLayout} ${styles.sectionPad}`}>
      <div className={`${styles.articleBody} ${reveal}`} data-reveal>
        {sections.map((section, index) => (
          <ArticleSection key={section.key || index} section={section} />
        ))}
      </div>
    </div>
  );
}
