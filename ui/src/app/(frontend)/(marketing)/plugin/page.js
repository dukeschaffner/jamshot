import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPageMetadata } from '@/lib/marketing/constants';
import MarketingStructuredData from '@/components/marketing/sections/MarketingStructuredData';
import { MarketingArticleBody } from '@/components/marketing/sections/MarketingArticle';
import MarketingCardGrid from '@/components/marketing/sections/MarketingCardGrid';
import MarketingCenteredActions from '@/components/marketing/sections/MarketingCenteredActions';
import MarketingFeatureCards from '@/components/marketing/sections/MarketingFeatureCards';
import MarketingPluginHero from '@/components/marketing/sections/MarketingPluginHero';
import MarketingSteps from '@/components/marketing/sections/MarketingSteps';

export const metadata = buildPageMetadata(
  {
    title: "Sterio Plugin",
    seo: {
      metaTitle: "Sterio Plugin - DAW Collaboration for Artists & Producers | Sterio.fm",
      metaDescription: "Use the Sterio Plugin on an instrument or MIDI track to play stems from a Sterio track in sync with your DAW, record new parts with your own plugins, and collaborate without changing your production workflow.",
      ogImage: "https://cdn.sterio.fm/images/static/plugin.jpg",
      ogImageAlt: "Sterio Plugin loaded on an instrument track inside a DAW",
      noIndex: false,
    },
  },
  "plugin",
);

export default function Page() {
  return (
    <MarketingLayout>

      <MarketingStructuredData
        id="structured-data-plugin"
        data={[{"@id": "https://sterio.fm/plugin#software", "url": "https://sterio.fm/plugin", "name": "Sterio Plugin", "@type": "SoftwareApplication", "image": "https://sterio.fm/marketing/sterio-plugin-screenshot.png", "@context": "https://schema.org", "description": "A DAW plugin that lets musicians play stems from a Sterio track in sync with their DAW and record new parts with their own production setup.", "operatingSystem": "macOS, Windows", "applicationCategory": "MultimediaApplication"}, {"@type": "BreadcrumbList", "@context": "https://schema.org", "itemListElement": [{"item": "https://sterio.fm/", "name": "Home", "@type": "ListItem", "position": 1}, {"item": "https://sterio.fm/plugin", "name": "Sterio Plugin", "@type": "ListItem", "position": 2}]}]}
      />
      <MarketingPluginHero
        eyebrow="Sterio Plugin"
        headline="Collaborate in Sterio without leaving your DAW."
        subhead="Play stems from a Sterio track in sync with your DAW's transport, record a new part with your own instruments and plugins, then bring that take back into the collab."
        image="https://cdn.sterio.fm/images/static/plugin.jpg"
        imageAlt="Sterio Plugin loaded on an instrument MIDI track inside a DAW, with the Sterio plugin window open and a Sterio track loaded."
        caption="load Sterio on an instrument or MIDI track, not an audio track."
        actions={[{ label: "Download Plugin", href: "#download", variant: "primary" }, { label: "How It Works", href: "#how-plugin-works", variant: "secondary" }]}
      />
      <MarketingSteps
        eyebrow="Why it exists"
        heading="For producers who want the social collab flow and their real studio setup."
        subhead="The Sterio app makes it easy to find the idea and the collaborator. The plugin lets you do the serious production work inside the DAW you already know."
        softBackground={true}
        anchorId="how-plugin-works"
        steps={[
          {
            number: "01",
            title: "Open a Sterio track",
            text: "Choose a collaboration from Sterio and load its stems into the plugin.",
          },
          {
            number: "02",
            title: "Load it on a MIDI track",
            text: "Add Sterio to an instrument or MIDI track, then play the stems with your DAW transport so your new part lands in time.",
          },
          {
            number: "03",
            title: "Record your take",
            text: "Use your own synths, guitar chain, vocal presets, samplers, and mix tools.",
          }
        ]}
      />
      <MarketingCardGrid
        eyebrow="Downloads"
        heading="Choose the installer for your studio."
        variant="downloads"
        softBackground={false}
        cards={[
          { title: "macOS", text: ".pkg installer for macOS. Compatible with major DAWs that support AU or VST3.", platform: "macOS", buttonLabel: "Download", buttonHref: "https://cdn.sterio.fm/plugin/Sterio-Plugin.pkg" },
          { title: "Windows x64", text: "Zip file containing the VST3 plugin and installation guide for Windows x64.", platform: "Windows", buttonLabel: "Download", buttonHref: "https://cdn.sterio.fm/plugin/Sterio-Plugin-Windows-x64-VST3.zip" }
        ]}
      />
      <MarketingFeatureCards
        eyebrow="Built for real sessions"
        heading="Keep the parts of your workflow that already feel good."
        features={[{ icon: "DAW", title: "Use your own DAW", text: "Stay in Logic, Ableton, FL Studio, Reaper, Studio One, Cubase, or the setup you already trust." }, { icon: "FX", title: "Use your own plugins", text: "Track with your favorite instruments, presets, vocal chains, amp sims, and mix tools." }, { icon: "SYNC", title: "Stay in time", text: "Hear the Sterio stems locked to your session so the new take lines up naturally." }, { icon: "TAKE", title: "Bring it back to Sterio", text: "Use the DAW for precision, then return to Sterio for discovery, versions, and collaboration." }]}
      />
      <MarketingCenteredActions
        eyebrow="Need help?"
        heading="Get the plugin into your session."
        text="Check the collaboration guides or contact support if installation, setup, or DAW routing gets in the way."
        anchorId="plugin-help"
        actions={[{ label: "Documentation", href: "/guides", variant: "secondary" }, { label: "Contact Support", href: "/contact", variant: "primary" }]}
      />
      <MarketingArticleBody
        sections={[
            {
              type: 'heading',
              heading: "Watch the Sterio plugin tutorial",
            },
            {
              type: 'paragraph',
              children: <p>This two-and-a-half-minute walkthrough shows how to load the Sterio Plugin on an instrument or MIDI track, play Sterio stems in sync with your DAW, and record a new take without changing your production workflow. It is a quick visual companion to the setup steps above.</p>,
            },
            {
              type: 'html',
              html: " ",
              caption: "Tutorial: using the Sterio Plugin to bring a Sterio track into your DAW and record a new take.",
            },
            {
              type: 'callout',
              heading: "Ready to try it in your session?",
              children: <p>Download the plugin, add it to an instrument or MIDI track, and use the video as a reference while you set up your first Sterio collaboration.</p>,
              buttonLabel: "Download Plugin",
              buttonHref: "#download",
            },
            {
              type: 'paragraph',
              children: <p>For more context on collaborating across DAWs, read the full guide on online music collaboration without using the same DAW.</p>,
            }
          ]}
      />
    </MarketingLayout>
  );
}
