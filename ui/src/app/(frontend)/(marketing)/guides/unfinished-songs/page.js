import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPageMetadata } from '@/lib/marketing/constants';
import MarketingArticle from '@/components/marketing/sections/MarketingArticle';

export const metadata = buildPageMetadata(
  {
    title: "What to Do With Unfinished Songs and Music Ideas",
    seo: {
      metaTitle: "What to Do With Unfinished Songs and Music Ideas | Sterio.fm",
      metaDescription: "Learn what to do with unfinished songs, rough demos, hooks, beats, riffs, and music ideas so they can become real collaborations.",
      ogImage: "https://images.unsplash.com/photo-1579017308347-e53e0d2fc5e9?w=1400&auto=format&fit=crop&q=80",
      ogImageAlt: "Songwriting notebook and guitar for unfinished song ideas",
      noIndex: false,
    },
  },
  "guides/unfinished-songs",
);

export default function Page() {
  return (
    <MarketingLayout>
      <MarketingArticle
        backHref="/guides"
        backLabel="Back to Guides"
        meta="Song ideas"
        headline="What to Do With Unfinished Songs and Music Ideas"
        intro={<p>Unfinished songs are not failures. They are often the most honest part of the creative process: the hook that still works, the beat with no second section, the guitar riff you love, the vocal melody you cannot place yet, the loop that feels too good to delete. The question is not whether every idea deserves a full release. The better question is what the idea might become if someone else heard the missing part.</p>}
        sections={[
            {
              type: 'html',
              html: " ",
              caption: "An unfinished song can be a dead end, or it can be the clearest invitation for another musician to add something new.",
            },
            {
              type: 'heading',
              heading: "Separate unfinished from unusable",
            },
            {
              type: 'paragraph',
              children: <p>A song can be unfinished and still be valuable. Maybe the chorus is strong but the verse is not there. Maybe the drums work but the bassline does not. Maybe the vocal melody has a feeling that the production has not caught up to yet. Before you abandon a music idea, identify what still feels alive. That one piece is enough to share. Sterio is designed for this kind of creative handoff because the idea does not need to arrive as a polished record. It just needs enough shape for another musician to hear a possible next move.</p>,
            },
            {
              type: 'heading',
              heading: "Turn the stuck point into a prompt",
            },
            {
              type: 'paragraph',
              children: <p>If you do not know how to finish an unfinished song, write down the specific problem. “Needs a bridge,” “drums feel flat,” “vocal wants a harmony,” “beat needs a bassline,” or “second half needs energy” are all useful prompts. A clear prompt helps collaborators contribute without guessing. It also makes the idea easier to search, organize, and revive later. The goal is not to over-explain the song. It is to point another creative person toward the exact opening where their taste could matter.</p>,
            },
            {
              type: 'heading',
              heading: "Let someone else hear the part you cannot",
            },
            {
              type: 'paragraph',
              children: <p>A lot of unfinished songs stay unfinished because the original creator has heard them too many times. Fresh ears can change that. A producer might hear a groove in your voice memo. A guitarist might answer your hook with a counter-melody. A vocalist might find the topline your beat was waiting for. This is why online music collaboration can be more than file sharing. When the right person adds a take, the song stops feeling stuck and starts feeling possible again.</p>,
            },
            {
              type: 'heading',
              heading: "Do not wait until the idea is perfect",
            },
            {
              type: 'paragraph',
              children: <p>Waiting for a perfect demo is one of the easiest ways to bury good music. If the idea has a pulse, share it while the feeling is still fresh. A short clip, loop, stem bounce, or rough vocal can be enough for someone else to respond. If a collaborator wants to build in a DAW, the Sterio plugin can help them pull the idea into their own workflow and return a new part. That keeps the collaboration practical without making the original sketch carry the weight of a finished production.</p>,
            },
            {
              type: 'callout',
              heading: "Your unfinished song may be someone else’s starting point",
              children: <p>Post the strongest part of the idea. Name what it needs. Let another musician add the missing piece before the spark disappears.</p>,
              buttonLabel: "Start a Collaboration",
              buttonHref: "/register",
            },
            {
              type: 'paragraph',
              children: <p>Explore more Sterio guides for practical ways to share music ideas and keep collaborations moving.</p>,
            }
          ]}
      />
    </MarketingLayout>
  );
}
