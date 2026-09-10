import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPageMetadata } from '@/lib/marketing/constants';
import MarketingStructuredData from '@/components/marketing/sections/MarketingStructuredData';
import MarketingCardGrid from '@/components/marketing/sections/MarketingCardGrid';
import MarketingCta from '@/components/marketing/sections/MarketingCta';
import MarketingPageHero from '@/components/marketing/sections/MarketingPageHero';

export const metadata = buildPageMetadata(
  {
    title: "Guides",
    seo: {
      metaTitle: "Guides — Music Collaboration Tips, Tools & Strategies | Sterio.fm",
      metaDescription: "Practical SEO-friendly guides for artists and producers on finding collaborators, sharing music projects, working across DAWs, and finishing songs through online music collaboration.",
      ogImage: "/marketing/duke-pfp.jpg",
      ogImageAlt: "Sterio team profile image",
      noIndex: false,
    },
  },
  "guides",
);

export default function Page() {
  return (
    <MarketingLayout>

      <MarketingStructuredData
        id="structured-data-guides"
        data={{"name": "Sterio Guides", "@type": "CollectionPage", "@context": "https://schema.org", "description": "Guides for musicians on collaboration, remote music creation, and creative momentum."}}
      />
      <MarketingPageHero
        eyebrow="Guides"
        headline="Practical music collaboration guides for artists and producers."
        subhead="Find better collaborators, share music projects without friction, work across DAWs, and turn unfinished ideas into tracks that keep moving."
      />
      <MarketingCardGrid
        heading="Browse music collaboration guides for artists and producers."
        variant="guides"
        softBackground={false}
        cards={[
          { meta: "Collaboration", title: "How to Find a Music Producer to Collaborate With Online", text: "Look for sound fit, communication style, and a low-friction way to trade ideas before you commit to a full project.", href: "/guides/find-producer", linkLabel: "Read guide", featured: true },
          { meta: "Remote sessions", title: "How to Start a Long-Distance Collab Without Losing Momentum", text: "Keep the creative spark alive when nobody is in the same room.", href: "/guides/long-distance-collab", linkLabel: "Read guide" },
          { meta: "Collaboration", title: "How to Find Musicians to Collaborate With Online", text: "Find players, producers, vocalists, and creative partners by sharing a clear musical starting point.", image: "https://images.unsplash.com/photo-1782491535681-757ca754fe69?q=80&w=1400&auto=format&fit=crop", imageAlt: "Musicians collaborating in a recording studio with laptops and audio gear", href: "/guides/find-musicians-to-collaborate-with", linkLabel: "Read guide" },
          { meta: "Remote sessions", title: "How to Collaborate on Music Online Without Using the Same DAW", text: "Use stems, shared references, and the Sterio plugin to collaborate across different production setups.", image: "https://cdn.sterio.fm/images/static/plugin.jpg", imageAlt: "Sterio Plugin loaded in a DAW for remote music collaboration", href: "/guides/collaborate-on-music-online-without-same-daw", linkLabel: "Read guide" },
          { meta: "Song ideas", title: "What to Do With Unfinished Songs and Music Ideas", text: "Turn rough hooks, beats, riffs, and voice memos into collaboration prompts instead of abandoned files.", image: "https://images.unsplash.com/photo-1579017308347-e53e0d2fc5e9?w=1400&auto=format&fit=crop&q=80", imageAlt: "Songwriting notebook and guitar for unfinished song ideas", href: "/guides/unfinished-songs", linkLabel: "Read guide" },
          { meta: "Workflow", title: "Best Ways to Share Music Projects With Other Musicians", text: "Compare stems, cloud folders, DAW sessions, Discord, collaboration platforms, and idea-first sharing.", image: "https://images.unsplash.com/photo-1617994452722-4145e196248b?w=1400&auto=format&fit=crop&q=80", imageAlt: "Audio waveform and music project files on a laptop for collaboration", href: "/guides/share-music-projects", linkLabel: "Read guide" },
          { meta: "DAW workflow", title: "Sterio Plugin for DAW Collaboration", text: "Use Sterio with your own DAW to build from shared ideas, record new parts, and return better takes.", image: "https://cdn.sterio.fm/images/static/plugin.jpg", imageAlt: "Sterio Plugin loaded in a DAW for music collaboration", href: "/plugin", linkLabel: "View plugin" }
        ]}
      />
      <MarketingCta
        eyebrow="Less waiting, more making"
        heading="Find your next collab by sharing the idea first."
        buttonLabel="Find Your Next Collab"
        buttonHref="/register"
      />
    </MarketingLayout>
  );
}
