import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPageMetadata } from '@/lib/marketing/constants';
import MarketingArticle from '@/components/marketing/sections/MarketingArticle';

export const metadata = buildPageMetadata(
  {
    title: "How to Collaborate on Music Online Without Using the Same DAW",
    seo: {
      metaTitle: "How to Collaborate on Music Online Between DAWs | Sterio.fm",
      metaDescription: "Learn how to collaborate on music online when artists and producers use different DAWs, plugins, stems, and remote workflows.",
      ogImage: "https://cdn.sterio.fm/images/static/plugin.jpg",
      ogImageAlt: "Sterio Plugin loaded in a DAW for remote music collaboration",
      noIndex: false,
    },
  },
  "guides/collaborate-on-music-online-without-same-daw",
);

export default function Page() {
  return (
    <MarketingLayout>
      <MarketingArticle
        backHref="/guides"
        backLabel="Back to Guides"
        meta="Remote sessions"
        headline="How to Collaborate on Music Online Without Using the Same DAW"
        intro={<p>You should not need the same DAW to collaborate on music online. One person might write in Logic, another might produce in Ableton, another might track vocals in FL Studio, and someone else might mix in Pro Tools. The challenge is not the software itself. The challenge is keeping the musical idea clear enough that every collaborator can add something without breaking the flow.</p>}
        sections={[
            {
              type: 'html',
              html: " ",
              caption: "The Sterio plugin helps producers work in their own DAW while still building from a shared Sterio idea.",
            },
            {
              type: 'heading',
              heading: "Do not make the DAW the starting point",
            },
            {
              type: 'paragraph',
              children: <p>A lot of remote music collaboration gets stuck because people start by asking what DAW everyone uses. That matters eventually, but it should not decide whether the song can move. The better starting point is the musical idea: a hook, beat, chord loop, topline, bassline, or rough arrangement that someone else can understand immediately. If the idea is clear, collaborators can add value from almost any setup. If the idea is buried inside a giant session file, even people with the same DAW may avoid opening it.</p>,
            },
            {
              type: 'heading',
              heading: "Use audio stems as the common language",
            },
            {
              type: 'paragraph',
              children: <p>When musicians use different DAWs, audio stems are usually the safest handoff format. Export the drums, bass, chords, vocals, and key melodic parts as separate files with the same start point. Include the tempo, key, and a quick note about what kind of contribution you want. This gives a collaborator enough context to write in their own software without needing your exact plugins or session routing. Stems are especially useful for producers, vocalists, instrumentalists, and mixers who each need a different level of control.</p>,
            },
            {
              type: 'heading',
              heading: "Use the Sterio plugin when the idea needs a DAW",
            },
            {
              type: 'paragraph',
              children: <p>Sometimes a collaborator needs more than a bounced reference. They may want to write a synth part, record guitar, build drums, or arrange around the original stems inside their own production workflow. That is where the Sterio plugin fits naturally. It lets a producer load Sterio stems in sync with their DAW, create a new part with their own instruments and effects, and bring that take back into the collaboration. The point is not to force everyone into one DAW. It is to let each person work where they are strongest while the shared idea stays connected.</p>,
            },
            {
              type: 'heading',
              heading: "Keep versions understandable",
            },
            {
              type: 'paragraph',
              children: <p>Different DAWs create different file habits, so version clarity matters. Name exports clearly, keep the latest idea easy to find, and avoid sending five unlabeled bounces with no explanation. A good online music collaboration workflow should make it obvious what changed and what someone should react to next. Sterio is useful here because contributions become new musical takes around the same idea, instead of a trail of disconnected files, messages, and folders.</p>,
            },
            {
              type: 'callout',
              heading: "The best DAW is the one that keeps the song moving",
              children: <p>Let collaborators use the tools they know. Share the idea clearly, keep versions attached to the music, and make every next step easy to hear.</p>,
              buttonLabel: "Start a Collaboration",
              buttonHref: "/register",
            },
            {
              type: 'paragraph',
              children: <p>Explore more Sterio guides for practical ways to keep remote collaboration moving from first idea to finished song.</p>,
            }
          ]}
      />
    </MarketingLayout>
  );
}
