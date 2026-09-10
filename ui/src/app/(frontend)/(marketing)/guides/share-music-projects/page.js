import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPageMetadata } from '@/lib/marketing/constants';
import MarketingArticle from '@/components/marketing/sections/MarketingArticle';

export const metadata = buildPageMetadata(
  {
    title: "Best Ways to Share Music Projects With Other Musicians",
    seo: {
      metaTitle: "Best Ways to Share Music Projects With Other Musicians | Sterio.fm",
      metaDescription: "Compare the best ways to share music projects for collaboration, including stems, cloud folders, DAW sessions, Discord, and idea-first workflows.",
      ogImage: "https://images.unsplash.com/photo-1617994452722-4145e196248b?w=1400&auto=format&fit=crop&q=80",
      ogImageAlt: "Audio waveform and music project files on a laptop for collaboration",
      noIndex: false,
    },
  },
  "guides/share-music-projects",
);

export default function Page() {
  return (
    <MarketingLayout>
      <MarketingArticle
        backHref="/guides"
        backLabel="Back to Guides"
        meta="Workflow"
        headline="Best Ways to Share Music Projects With Other Musicians"
        intro={<p>Sharing music projects sounds simple until the files start multiplying. One collaborator wants stems. Another wants the whole DAW session. Someone sends a Dropbox link, someone else replies in Discord, and suddenly nobody knows which version is current. The best way to share music for collaboration depends on what you are trying to accomplish: quick feedback, a new musical part, production work, mixing, or a full remote session.</p>}
        sections={[
            {
              type: 'html',
              html: " ",
              caption: "The right sharing method depends on whether you need feedback, a new take, or full production control.",
            },
            {
              type: 'heading',
              heading: "Use stems when collaborators need flexibility",
            },
            {
              type: 'paragraph',
              children: <p>Stems are one of the most reliable ways to share music projects because they work across almost every DAW. Export drums, bass, chords, vocals, lead parts, and effects from the same starting point so another musician can line them up easily. Stems are ideal when a producer, vocalist, instrumentalist, or mixer needs control without needing your exact plugins. The tradeoff is that stems can still become messy if they are not labeled clearly or if every new version lives in a different folder.</p>,
            },
            {
              type: 'heading',
              heading: "Use cloud folders for storage, not momentum",
            },
            {
              type: 'paragraph',
              children: <p>Dropbox, Google Drive, iCloud, and similar tools are useful for storing large files, but they are not built to keep a creative thread alive. A cloud folder can hold stems, mixes, references, and session files, but it usually does not explain what changed or what someone should add next. If you use cloud storage, add a simple naming system, a notes file, and dates on every export. Otherwise collaborators waste energy figuring out the folder instead of responding to the song.</p>,
            },
            {
              type: 'heading',
              heading: "Use full DAW sessions only when everyone needs the details",
            },
            {
              type: 'paragraph',
              children: <p>A full DAW session is powerful, but it is also the highest-friction way to collaborate. It can break because of missing plugins, different software versions, sample paths, routing, or operating systems. Send the full session when someone truly needs arrangement detail, MIDI, automation, or mix routing. For most early collaboration, a bounce plus selected stems is easier. If collaborators use different DAWs, the Sterio plugin can help bridge the gap by letting someone work with Sterio stems inside their own setup.</p>,
            },
            {
              type: 'heading',
              heading: "Use idea-first platforms when the song needs a response",
            },
            {
              type: 'paragraph',
              children: <p>Sometimes the best way to share music for collaboration is not to share the whole project. It is to share the part that needs a response. A hook, beat, riff, vocal idea, or unfinished section can invite another musician in faster than a complete folder. Sterio takes this idea-first approach: post the spark, let musicians add takes, and keep each version connected to the original song idea. That makes collaboration easier to follow and easier for new contributors to understand.</p>,
            },
            {
              type: 'callout',
              heading: "Share the amount of project someone actually needs",
              children: <p>Send stems for flexibility, sessions for detail, folders for storage, and musical ideas when you want another person to add something real.</p>,
              buttonLabel: "Start a Collaboration",
              buttonHref: "/register",
            },
            {
              type: 'paragraph',
              children: <p>Explore more Sterio guides for practical ways to find collaborators, share ideas, and finish songs online.</p>,
            }
          ]}
      />
    </MarketingLayout>
  );
}
