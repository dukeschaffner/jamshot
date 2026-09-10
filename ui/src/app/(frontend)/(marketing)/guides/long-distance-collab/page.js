import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPageMetadata } from '@/lib/marketing/constants';
import MarketingStructuredData from '@/components/marketing/sections/MarketingStructuredData';
import MarketingArticle from '@/components/marketing/sections/MarketingArticle';

export const metadata = buildPageMetadata(
  {
    title: "How to keep long-distance collabs from dying in your inbox",
    seo: {
      metaTitle: "How to Keep Long-Distance Music Collabs Moving ",
      metaDescription: "Long-distance collabs die in inboxes every day. Here's how to keep the momentum alive when your collaborators are in different cities.",
      ogImage: "https://cdn.sterio.fm/images/static/meta-link-logo.png",
      ogImageAlt: "Sterio guide for starting a long-distance music collaboration",
      noIndex: false,
    },
  },
  "guides/long-distance-collab",
);

export default function Page() {
  return (
    <MarketingLayout>

      <MarketingStructuredData
        id="structured-data-guides/long-distance-collab"
        data={{"@type": "Article", "image": {"url": "https://cdn.sterio.fm/images/static/meta-link-logo.png", "@type": "ImageObject"}, "author": {"url": "https://sterio.fm", "name": "Sterio.fm", "@type": "Organization"}, "@context": "https://schema.org", "headline": "How to keep long-distance collabs from dying in your inbox", "isPartOf": {"url": "https://sterio.fm/guides", "name": "Sterio Blog", "@type": "Blog"}, "keywords": ["music collaboration", "remote music production", "long distance collab", "music co-writing", "Sterio"], "publisher": {"url": "https://sterio.fm", "logo": {"url": "https://cdn.sterio.fm/images/static/meta-link-logo.png", "@type": "ImageObject"}, "name": "Sterio.fm", "@type": "Organization"}, "inLanguage": "en-US", "description": "Long-distance collabs die in inboxes every day. Here's how to keep the momentum alive when your collaborators are in different cities.", "dateModified": "2026-06-19", "datePublished": "2026-06-19", "articleSection": "Collaboration", "mainEntityOfPage": {"@id": "https://sterio.fm/how-to-keep-long-distance-collabs-moving", "@type": "WebPage"}}}
      />
      <MarketingArticle
        backHref="/guides"
        backLabel="Back to Guides"
        meta="Remote sessions"
        headline="How to Start a Long-Distance Collab Without Losing Momentum"
        intro={<p>The hardest part of remote collaboration is not distance. It is letting the idea sit too long without a clear next move.</p>}
        sections={[
            {
              type: 'heading',
              heading: "The distance isn't the problem",
            },
            {
              type: 'paragraph',
              children: <p>When a long-distance collab falls apart, it's easy to blame the miles. Different time zones. Conflicting schedules. But most of the time, the collab didn't die because of distance. It died because of friction. Someone had to set up a session. Someone had to send a file. Someone had to follow up. And the longer that chain gets, the easier it is for both people to quietly let it go.</p>,
            },
            {
              type: 'heading',
              heading: "Keep something always moving",
            },
            {
              type: 'paragraph',
              children: <p>The worst thing a long-distance collab can do is go quiet. Not because silence means nobody cares — but because silence breaks momentum, and momentum is basically everything in a creative relationship. The goal isn't to finish something every week. It's to keep something in motion. A rough idea. A new chord progression. Even just a voice memo that says 'I was thinking about taking this in a different direction.' Tiny movements keep the thread alive.</p>,
            },
            {
              type: 'heading',
              heading: "Stop waiting for the perfect window to work",
            },
            {
              type: 'paragraph',
              children: <p>Long-distance collabs often stall because both people are waiting for the same thing: a two-hour block where they're both free, inspired, and ready to dig in. That window almost never comes. The better move is to work in smaller, looser bursts. One person adds something. The other reacts to it when they can. It's less like a session and more like a conversation. And conversations don't need to happen in real time to feel alive.</p>,
            },
            {
              type: 'heading',
              heading: "Make it easy to respond, not easy to ignore",
            },
            {
              type: 'paragraph',
              children: <p>If someone sends you a full Logic session and asks what you think, that's a big ask. You have to download it, open it, have the right plugins, find something to say. Compare that to someone dropping a 45-second idea and saying 'build on this however you want.' The second one is almost impossible to ignore. When you lower the barrier to respond, people actually respond. That's the whole game.</p>,
            },
            {
              type: 'heading',
              heading: "Give the other person something to react to",
            },
            {
              type: 'paragraph',
              children: <p>The best long-distance collabs aren't built on check-ins and status updates. They're built on ideas that demand a reaction. Something a little unfinished. Something with a question baked into it. When you post a half-built idea that clearly has room to grow, you're not asking someone to review your work — you're inviting them into it. That's a completely different energy, and people feel the difference.</p>,
            },
            {
              type: 'heading',
              heading: "The inbox was never the right place for this",
            },
            {
              type: 'paragraph',
              children: <p>Email threads, shared folders, Dropbox links with no context — these aren't collaboration tools. They're storage. Real collaboration needs somewhere that feels alive, where an idea can land and someone can actually build on it without jumping through hoops. Sterio is built for exactly this: post an idea, let your collaborator add to it, keep it moving. No setup. No project management. Just music going somewhere.</p>,
            },
            {
              type: 'callout',
              heading: "Make distance feel less distant",
              children: <p>Sterio turns each reply into a musical version, so the collaboration keeps feeling alive.</p>,
              buttonLabel: "Join Sterio",
              buttonHref: "/register",
            }
          ]}
      />
    </MarketingLayout>
  );
}
