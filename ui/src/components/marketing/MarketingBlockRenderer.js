import Link from 'next/link';
import MarketingAuthAction from '@/components/marketing/MarketingAuthAction';
import { resolveMarketingAsset } from '@/lib/marketing/constants';
import styles from './MarketingSite.module.css';

function HeroPhoneMock() {
  return (
    <div className={styles.phoneMock}>
      <div className={styles.uploadChip}>Upload a musical idea</div>
      <div className={styles.trackCard}>
        <div className={styles.trackTopline}>
          <div>
            <span className={styles.miniLabel}>Chris posted</span>
            <h2>Late night hook idea</h2>
          </div>
          <span className={styles.genrePill}>indie pop</span>
        </div>
        <div className={styles.waveform} aria-hidden="true">
          {Array.from({ length: 10 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
        <div className={styles.trackActions}>
          <button type="button" className={styles.iconButton} aria-label="Play track preview">
            &#9658;
          </button>
          <button type="button" className={styles.takeButton}>
            Add Your Take
          </button>
        </div>
      </div>
      <div className={styles.versionStack}>
        <article>
          <img src="https://cdn.sterio.fm/images/static/duke.jpg" alt="Duke profile photo" />
          <div>
            <strong>Duke added drums</strong>
            <p>Turned the hook into a groove.</p>
          </div>
        </article>
        <article>
          <img src="https://cdn.sterio.fm/images/static/rob.jpg" alt="Rob Stone profile photo" />
          <div>
            <strong>Rob $tone added a verse</strong>
            <p>A music comment that became the next version.</p>
          </div>
        </article>
      </div>
    </div>
  );
}

function renderArticleSections(block, reveal) {
  return block.sections?.map((section, sectionIndex) => {
    if (section.type === 'heading') {
      return <h2 key={`heading-${sectionIndex}`}>{section.heading}</h2>;
    }

    if (section.type === 'callout') {
      return (
        <div className={styles.articleCallout} key={`callout-${sectionIndex}`}>
          {section.heading && <h2>{section.heading}</h2>}
          {section.text && <p>{section.text}</p>}
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

    return <p key={`paragraph-${sectionIndex}`}>{section.text}</p>;
  });
}

function renderArticlePage(headerBlock, sectionsBlock, index) {
  const reveal = `${styles.reveal} marketing-reveal`;
  const key = headerBlock.id || `article-${index}`;

  return (
    <article className={`${styles.articleLayout} ${styles.sectionPad}`} key={key}>
      <header className={`${styles.articleHeader} ${reveal}`} data-reveal>
        <Link className={styles.textLink} href={headerBlock.backHref || '/guides'}>
          {headerBlock.backLabel || 'Back to Guides'}
        </Link>
        {headerBlock.meta && <p className={styles.guideMeta}>{headerBlock.meta}</p>}
        <h1>{headerBlock.headline}</h1>
        {headerBlock.intro && <p>{headerBlock.intro}</p>}
      </header>
      <div className={`${styles.articleBody} ${reveal}`} data-reveal>
        {renderArticleSections(sectionsBlock, reveal)}
      </div>
    </article>
  );
}

function renderBlock(block, index) {
  const reveal = `${styles.reveal} marketing-reveal`;
  const key = block.id || `${block.blockType}-${index}`;

  switch (block.blockType) {
    case 'hero':
      return (
        <section className={`${styles.hero} ${styles.sectionPad}`} key={key}>
          <div className={`${styles.heroCopy} ${reveal}`} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h1>{block.headline}</h1>
            {block.subhead && <p className={styles.heroSubhead}>{block.subhead}</p>}
            {block.actions?.length > 0 && (
              <div className={styles.heroActions}>
                {block.actions.map((action) => (
                  <MarketingAuthAction key={`${action.label}-${action.href}`} action={action} />
                ))}
              </div>
            )}
            {block.stats?.length > 0 && (
              <div className={styles.quickStats}>
                {block.stats.map((stat) => (
                  <span key={`${stat.highlight}-${stat.label}`}>
                    <strong>{stat.highlight}</strong> {stat.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          {block.showPhoneMock !== false && (
            <div
              className={`${styles.heroVisual} ${reveal}`}
              data-reveal
              aria-label="Mock interface showing a Sterio collaboration thread"
            >
              <HeroPhoneMock />
            </div>
          )}
        </section>
      );

    case 'pageHero':
      return (
        <section className={`${styles.pageHero} ${styles.sectionPad}`} key={key}>
          <div className={`${styles.narrow} ${reveal}`} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h1>{block.headline}</h1>
            {block.subhead && <p>{block.subhead}</p>}
          </div>
        </section>
      );

    case 'twoPanel':
      return (
        <section className={`${styles.splitSection} ${styles.sectionPad}`} key={key}>
          <div className={`${styles.sectionIntro} ${reveal}`} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h2>{block.heading}</h2>
          </div>
          <div className={`${styles.twoColumn} ${reveal}`} data-reveal>
            <div className={styles.textPanel}>
              <h3>{block.leftTitle}</h3>
              <p>{block.leftText}</p>
            </div>
            <div
              className={`${styles.textPanel} ${
                block.rightStyle === 'gradient' ? styles.gradientPanel : ''
              }`}
            >
              <h3>{block.rightTitle}</h3>
              <p>{block.rightText}</p>
            </div>
          </div>
        </section>
      );

    case 'steps':
      return (
        <section
          className={`${styles.sectionPad} ${block.softBackground ? styles.softBand : ''}`}
          id={block.anchorId || undefined}
          key={key}
        >
          <div className={`${styles.sectionHeading} ${reveal}`} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h2>{block.heading}</h2>
            {block.subhead && <p>{block.subhead}</p>}
          </div>
          <div className={styles.stepsGrid}>
            {block.steps?.map((step) => (
              <article className={`${styles.stepCard} ${reveal}`} data-reveal key={step.number}>
                <span className={styles.stepNumber}>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>
      );

    case 'featureCards':
      return (
        <section className={styles.sectionPad} key={key}>
          <div className={`${styles.sectionHeading} ${reveal}`} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h2>{block.heading}</h2>
            {block.subhead && <p>{block.subhead}</p>}
          </div>
          <div className={styles.featureGrid}>
            {block.features?.map((feature) => (
              <article className={`${styles.featureCard} ${reveal}`} data-reveal key={feature.title}>
                {feature.icon && <span className={styles.featureIcon}>{feature.icon}</span>}
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>
      );

    case 'community':
      return (
        <section className={`${styles.community} ${styles.sectionPad}`} key={key}>
          <div className={`${styles.communityCopy} ${reveal}`} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h2>{block.heading}</h2>
            <p>{block.text}</p>
          </div>
          <div className={`${styles.quoteCard} ${reveal}`} data-reveal>
            <p>&ldquo;{block.quote}&rdquo;</p>
            {block.quoteAttribution && <span>{block.quoteAttribution}</span>}
          </div>
        </section>
      );

    case 'cta':
      return (
        <section
          className={`${styles.finalCta} ${styles.sectionPad}`}
          id={block.anchorId || undefined}
          key={key}
        >
          <div className={reveal} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h2>{block.heading}</h2>
            {block.text && <p>{block.text}</p>}
            <MarketingAuthAction
              action={{ label: block.buttonLabel, href: block.buttonHref, variant: 'primary' }}
            />
          </div>
        </section>
      );

    case 'story':
      return (
        <section className={`${styles.storySection} ${styles.sectionPad}`} key={key}>
          <div className={`${styles.storyMedia} ${reveal}`} data-reveal>
            <img src={resolveMarketingAsset(block.image)} alt={block.imageAlt} />
          </div>
          <div className={`${styles.storyCopy} ${reveal}`} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h2>{block.heading}</h2>
            {block.paragraphs?.map((paragraph) => (
              <p key={paragraph.text.slice(0, 24)}>{paragraph.text}</p>
            ))}
          </div>
        </section>
      );

    case 'cardGrid':
      return (
        <section
          className={`${styles.sectionPad} ${block.softBackground ? styles.softBand : ''} ${
            block.variant === 'guides' ? styles.guideIndex : ''
          }`}
          id={block.variant === 'downloads' ? 'download' : undefined}
          key={key}
        >
          {(block.eyebrow || block.heading) && (
            <div className={`${styles.sectionHeading} ${reveal}`} data-reveal>
              {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
              <h2>{block.heading}</h2>
            </div>
          )}
          <div
            className={
              block.variant === 'team'
                ? styles.teamGrid
                : block.variant === 'guides'
                  ? styles.guideGrid
                  : block.variant === 'downloads'
                    ? styles.downloadList
                    : styles.beliefGrid
            }
          >
            {block.cards?.map((card) => {
              if (block.variant === 'downloads') {
                return (
                  <article className={`${styles.downloadCard} ${reveal}`} data-reveal key={card.title}>
                    <div>
                      <h3>{card.title}</h3>
                      {card.text && <p>{card.text}</p>}
                      {card.platform && <span className={styles.downloadPill}>{card.platform}</span>}
                    </div>
                    <MarketingAuthAction
                      action={{
                        label: card.buttonLabel || 'Download',
                        href: card.buttonHref,
                        variant: 'primary',
                      }}
                    />
                  </article>
                );
              }

              if (block.variant === 'team') {
                return (
                  <article className={`${styles.teamCard} ${reveal}`} data-reveal key={card.title}>
                    {card.image && (
                      <img src={resolveMarketingAsset(card.image)} alt={card.imageAlt || card.title} />
                    )}
                    <h3>{card.title}</h3>
                    {card.role && <p className={styles.role}>{card.role}</p>}
                    {card.text && <p>{card.text}</p>}
                  </article>
                );
              }

              if (block.variant === 'guides') {
                return (
                  <article
                    className={`${styles.guideCard} ${card.featured ? styles.featuredGuide : ''} ${reveal}`}
                    data-reveal
                    key={card.title}
                  >
                    {card.meta && <p className={styles.guideMeta}>{card.meta}</p>}
                    <h2>
                      {card.href ? <Link href={card.href}>{card.title}</Link> : card.title}
                    </h2>
                    {card.text && <p>{card.text}</p>}
                    {card.href && (
                      <Link className={styles.textLink} href={card.href}>
                        {card.linkLabel || 'Read guide'}
                      </Link>
                    )}
                  </article>
                );
              }

              return (
                <article className={`${styles.beliefCard} ${reveal}`} data-reveal key={card.title}>
                  <h3>{card.title}</h3>
                  {card.text && <p>{card.text}</p>}
                </article>
              );
            })}
          </div>
        </section>
      );

    case 'pluginHero':
      return (
        <section className={`${styles.pluginHero} ${styles.sectionPad}`} key={key}>
          <div className={`${styles.pluginHeroCopy} ${reveal}`} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h1>{block.headline}</h1>
            {block.subhead && <p>{block.subhead}</p>}
            {block.actions?.length > 0 && (
              <div className={styles.centeredActions}>
                {block.actions.map((action) => (
                  <MarketingAuthAction key={`${action.label}-${action.href}`} action={action} />
                ))}
              </div>
            )}
          </div>
          <figure className={`${styles.pluginStage} ${reveal}`} data-reveal>
            <img src={resolveMarketingAsset(block.image)} alt={block.imageAlt} />
            {block.caption && (
              <figcaption>
                <strong>Important setup note:</strong> {block.caption}
              </figcaption>
            )}
          </figure>
        </section>
      );

    case 'articleHeader':
      return (
        <article className={`${styles.articleLayout} ${styles.sectionPad}`} key={key}>
          <header className={`${styles.articleHeader} ${reveal}`} data-reveal>
            <Link className={styles.textLink} href={block.backHref || '/guides'}>
              {block.backLabel || 'Back to Guides'}
            </Link>
            {block.meta && <p className={styles.guideMeta}>{block.meta}</p>}
            <h1>{block.headline}</h1>
            {block.intro && <p>{block.intro}</p>}
          </header>
        </article>
      );

    case 'articleSections':
      return (
        <div className={`${styles.articleLayout} ${styles.sectionPad}`} key={key}>
          <div className={`${styles.articleBody} ${reveal}`} data-reveal>
            {renderArticleSections(block, reveal)}
          </div>
        </div>
      );

    case 'centeredActions':
      return (
        <section
          className={`${styles.pluginHelp} ${styles.sectionPad}`}
          id={block.anchorId || undefined}
          key={key}
        >
          <div className={reveal} data-reveal>
            {block.eyebrow && <p className={styles.eyebrow}>{block.eyebrow}</p>}
            <h2>{block.heading}</h2>
            {block.text && <p>{block.text}</p>}
            {block.actions?.length > 0 && (
              <div className={styles.centeredActions}>
                {block.actions.map((action) => (
                  <MarketingAuthAction key={`${action.label}-${action.href}`} action={action} />
                ))}
              </div>
            )}
          </div>
        </section>
      );

    default:
      return null;
  }
}

export default function MarketingBlockRenderer({ layout = [] }) {
  const nodes = [];

  for (let index = 0; index < layout.length; index += 1) {
    const block = layout[index];
    const nextBlock = layout[index + 1];

    if (block.blockType === 'articleHeader' && nextBlock?.blockType === 'articleSections') {
      nodes.push(renderArticlePage(block, nextBlock, index));
      index += 1;
      continue;
    }

    nodes.push(renderBlock(block, index));
  }

  return nodes;
}
