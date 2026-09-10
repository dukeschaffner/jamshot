import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPageMetadata } from '@/lib/marketing/constants';
import MarketingStructuredData from '@/components/marketing/sections/MarketingStructuredData';
import { MarketingArticleBody } from '@/components/marketing/sections/MarketingArticle';
import MarketingCta from '@/components/marketing/sections/MarketingCta';
import MarketingFeatureCards from '@/components/marketing/sections/MarketingFeatureCards';
import MarketingHero from '@/components/marketing/sections/MarketingHero';
import MarketingPluginHero from '@/components/marketing/sections/MarketingPluginHero';
import MarketingSteps from '@/components/marketing/sections/MarketingSteps';

export const metadata = buildPageMetadata(
  {
    title: "Home",
    seo: {
      metaTitle: "Music Collaboration Online - Find Musicians | Sterio.fm",
      metaDescription: "Find musicians to collaborate with on Sterio. Share a beat, vocal, or riff, add your own part, and build songs together online. Join free or browse tracks.",
      ogImage: "https://cdn.sterio.fm/images/static/meta-link-logo.png",
      ogImageAlt: "Sterio Logo",
      noIndex: false,
    },
  },
  "home",
);

export default function HomePage() {
  return (
    <MarketingLayout>

      <MarketingStructuredData
        id="structured-data-home"
        data={{"url": "https://sterio.fm/", "name": "Sterio.fm", "@type": "WebSite", "@context": "https://schema.org", "description": "A music collaboration platform where artists and producers post ideas, add takes, and build tracks together."}}
      />
      <MarketingHero
        eyebrow="Sterio | For musicians, artists and producers"
        headline="Make music together online."
        subhead="Share a beat, vocal, or riff. Find musicians who hear its potential, add your own part, and build something together."
        showPhoneMock={true}
        actions={[{ label: "Start Creating Free", href: "/register", variant: "primary" }, { label: "Browse Tracks", href: "/feed", variant: "secondary" }]}
        stats={[{ highlight: "Free", label: "to start" }, { highlight: "Any stage", label: "of an idea" }, { highlight: "Your DAW", label: "with the plugin" }]}
      />
      <MarketingArticleBody
        sections={[
            {
              type: 'heading',
              heading: "Start collaborating with musicians for free",
            },
            {
              type: 'paragraph',
              children: <p>See how an unfinished musical idea can find its direction as other musicians listen, respond, and add their own parts.</p>,
            },
            {
              type: 'html',
              html: " ",
              caption: "You can start making music with other people for free! All you need is an idea to start 👀",
            },
            {
              type: 'callout',
              heading: "Hear something you could add?",
              children: <p>Browse open tracks, listen for an idea that moves you, and respond with music of your own.</p>,
              buttonLabel: "Browse Tracks",
              buttonHref: "/feed",
            },
            {
              type: 'callout',
              heading: "Keep learning",
              children: <p>New to collaborating online? Explore practical guides for finding musicians, sharing projects, and working across different DAWs.</p>,
              buttonLabel: "Read Collaboration Guides",
              buttonHref: "/guides",
            }
          ]}
      />
      <MarketingSteps
        eyebrow="How it works"
        heading="Start with an idea. Build it together."
        softBackground={true}
        anchorId="how-it-works"
        steps={[
          {
            number: "01",
            title: "Find or share an idea",
            text: "Browse tracks for inspiration, or post a beat, riff, vocal, or unfinished song of your own.",
          },
          {
            number: "02",
            title: "Add your part",
            text: "Record a harmony, drum part, verse, or melody in response to an idea that moves you.",
          },
          {
            number: "03",
            title: "Build the next version",
            text: "Hear what each contribution brings and keep developing the track together.",
          }
        ]}
      />
      <MarketingPluginHero
        eyebrow="Keep your workflow"
        headline="Collaborate without leaving your DAW."
        subhead="Use the Sterio Plugin to play collaboration stems in sync with your session, record with your own instruments and effects, and bring your take back to Sterio."
        image="https://cdn.sterio.fm/images/static/plugin.jpg"
        imageAlt="Sterio Plugin loaded on an instrument MIDI track inside a DAW, with the Sterio plugin window open and a Sterio track loaded."
        caption="Available for macOS and Windows."
        actions={[{ label: "Explore the Plugin", href: "/plugin", variant: "primary" }, { label: "Learn How It Works", href: "/plugin#how-plugin-works", variant: "secondary" }]}
      />
      <MarketingFeatureCards
        eyebrow="Before your first collaboration"
        heading="A few things you might be wondering."
        features={[{ icon: "01", title: "What is Sterio?", text: "Sterio is an online music collaboration platform where musicians share ideas, add musical contributions, and develop tracks together." }, { icon: "02", title: "Do I need a finished song?", text: "No. A beat, riff, scratch vocal, or unfinished demo can be the starting point for a collaboration." }, { icon: "03", title: "Do we need the same DAW?", text: "No. Collaborate through audio without sharing a DAW session. The Sterio Plugin plays a track’s stems in sync with your own DAW while you record a new part." }, { icon: "04", title: "Where should I start?", text: "Browse tracks to find an idea you connect with, or create a free account and share your own. A single musical part is enough to begin." }]}
      />
      <MarketingCta
        eyebrow="Ready when the idea hits"
        heading="Post the start. Find the next part."
        text="Your next collaboration can start with a rough idea. Share yours or find a track that needs your sound."
        buttonLabel="Start Creating Free"
        buttonHref="/register"
        anchorId="join"
      />
    </MarketingLayout>
  );
}
