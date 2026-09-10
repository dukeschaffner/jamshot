import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPageMetadata } from '@/lib/marketing/constants';
import MarketingStructuredData from '@/components/marketing/sections/MarketingStructuredData';
import MarketingCardGrid from '@/components/marketing/sections/MarketingCardGrid';
import MarketingCta from '@/components/marketing/sections/MarketingCta';
import MarketingPageHero from '@/components/marketing/sections/MarketingPageHero';
import MarketingStory from '@/components/marketing/sections/MarketingStory';

export const metadata = buildPageMetadata(
  {
    title: "About",
    seo: {
      metaTitle: "About Sterio.fm — Built for Musicians, by Musicians",
      metaDescription: "Learn about the team behind Sterio.fm, why we built it, and our mission to make music collaboration as easy as it should be.",
      ogImage: "https://cdn.sterio.fm/images/static/duke.jpg",
      ogImageAlt: "Duke, founder and creator of Sterio",
      noIndex: false,
    },
  },
  "about",
);

export default function Page() {
  return (
    <MarketingLayout>

      <MarketingStructuredData
        id="structured-data-about"
        data={{"name": "About Sterio.fm", "@type": "AboutPage", "@context": "https://schema.org", "description": "The story and team behind Sterio.fm, a music collaboration platform built by musicians."}}
      />
      <MarketingPageHero
        eyebrow="Built from a real creative gap"
        headline="Music collaboration should start with inspiration, not setup."
        subhead="Duke created Sterio after watching music friendships drift apart, schedules stop lining up, and full hard drives of unfinished demos collect dust."
      />
      <MarketingStory
        image="https://cdn.sterio.fm/images/static/about_bio_pic.jpg"
        imageAlt="Duke, founder and creator of Sterio"
        eyebrow="The origin story"
        heading="From high school sessions to a platform for open collaboration."
      >
        <p>Duke played, wrote, and recorded music with his brother and a friend through high school and college. After college, everyone went separate ways, schedules got harder to line up, and the music slowed down.</p>
        <p>They tried online collaborative DAWs, but the process always started with setup: create a project, organize the session, invite people in, then stare at a blank starting point with no spark.</p>
        <p>At the same time, Duke had a hard drive full of unfinished song demos. He loved capturing the first idea more than building a full release identity every time with artwork, videos, rollout plans, and pressure.</p>
        <p>Sterio was created to feel more like jamming: post the idea, let someone add the next part, and keep the music moving before inspiration disappears.</p>
      </MarketingStory>
      <MarketingCardGrid
        eyebrow="What we believe"
        heading="Music first. Projects second."
        variant="beliefs"
        softBackground={true}
        cards={[
          { title: "Inspiration centered", text: "The starting point is the sound, not the folder structure. Artists can post daily updates of ideas and let inspiration lead." },
          { title: "Anyone can shoot their shot", text: "Indie artists should be able to reach bigger artists and new collaborators by adding something real, without asking for a huge commitment." },
          { title: "Open-source style music", text: "Everyone brings a skill. A bassline, hook, drum pocket, verse, or texture can help a track become more alive." },
          { title: "Fun belongs in the process", text: "No release identity required. No artwork or video pressure. Just the joy of recording ideas and seeing what other musicians hear in them." }
        ]}
      />
      <MarketingCardGrid
        eyebrow="Team"
        heading="The people pushing Sterio forward."
        variant="team"
        softBackground={false}
        cards={[
          { title: "Duke", text: "Musician building the tool he wanted when friends, distance, and blank sessions got in the way.", image: "https://cdn.sterio.fm/images/static/duke.jpg", imageAlt: "Duke profile photo", role: "Founder and creator of Sterio" },
          { title: "Chris", text: "Helps shape the story, audience, and creative direction so Sterio speaks like a real music platform.", image: "https://cdn.sterio.fm/images/static/chris.jpg", imageAlt: "Chris profile photo", role: "Marketing and creative strategy" },
          { title: "Rob $tone", text: "Brings the artist perspective and keeps the product tied to how musicians actually create.", image: "https://cdn.sterio.fm/images/static/rob.jpg", imageAlt: "Rob Stone profile photo", role: "Artist, collaborator, and creative partner" }
        ]}
      />
      <MarketingCta
        eyebrow="Make something together"
        heading="Collab with anyone, anytime, anywhere."
        text="Start with a sound. Let the best takes rise and give every musician a chance to be heard."
        buttonLabel="Join Sterio"
        buttonHref="/register"
      />
    </MarketingLayout>
  );
}
