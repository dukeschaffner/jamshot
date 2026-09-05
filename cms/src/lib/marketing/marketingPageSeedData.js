const pluginBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://cdn.sterio.fm';

export const marketingPages = [
  {
    title: 'Home',
    slug: 'home',
    status: 'published',
    seo: {
      metaTitle: 'Sterio.fm — Music Collaboration for Artists & Producers',
      metaDescription:
        'Sterio.fm is the music collaboration platform where artists and producers find each other, build tracks together, and comment on music with music. Start creating instantly.',
      ogImage: '/marketing/duke-pfp.jpg',
      ogImageAlt: 'Duke from the Sterio team',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Sterio.fm',
        url: 'https://sterio.fm/',
        description:
          'A music collaboration platform where artists and producers post ideas, add takes, and build tracks together.',
      },
    },
    layout: [
      {
        blockType: 'hero',
        eyebrow: 'Music collaboration, without the file-folder drag',
        headline: 'The Music Collaboration Platform Built for Artists and Producers',
        subhead:
          'Sterio is where musicians post ideas, add their own takes, and build tracks together without getting stuck in DMs, file folders, or empty project sessions.',
        actions: [
          { label: 'Start Creating Free', href: '/#join', variant: 'primary' },
          { label: 'Browse Tracks', href: '/feed', variant: 'secondary' },
        ],
        stats: [
          { highlight: '60 sec', label: 'idea posts' },
          { highlight: '1 tap', label: 'add-your-take flow' },
          { highlight: '0 setup', label: 'before inspiration' },
        ],
        showPhoneMock: true,
      },
      {
        blockType: 'twoPanel',
        eyebrow: 'The problem',
        heading: 'Collab tools made music feel like admin work.',
        leftTitle: 'Before Sterio',
        leftText:
          'Ideas get trapped in group chats, voice memos, hard drives, and sessions nobody wants to set up from scratch. The spark fades before the first take lands.',
        rightTitle: 'With Sterio',
        rightText:
          'Post the spark first. Let someone add a guitar line, drum pocket, verse, harmony, or remix as a new version. No blank sessions, no release pressure, no waiting on everyone\'s schedule to align.',
        rightStyle: 'gradient',
      },
      {
        blockType: 'steps',
        eyebrow: 'How it works',
        heading: 'From rough idea to real momentum in three moves.',
        anchorId: 'how-it-works',
        softBackground: true,
        steps: [
          {
            number: '01',
            title: 'Upload a musical idea',
            text: 'Drop a hook, beat, bass line, scratch vocal, or loop before you overthink it.',
          },
          {
            number: '02',
            title: 'Invite the next take',
            text: 'Artists and producers hear the idea in context and respond with music, not vague notes.',
          },
          {
            number: '03',
            title: 'Build the best version',
            text: 'Every contribution becomes a new branch of the track, so good ideas keep moving.',
          },
        ],
      },
      {
        blockType: 'featureCards',
        eyebrow: 'Features',
        heading: 'Made for the messy, social way music actually happens.',
        features: [
          {
            icon: 'MIC',
            title: 'Comment on music with music',
            text: 'Reply with a harmony, drum part, verse, or counter-melody instead of typing a paragraph.',
          },
          {
            icon: 'MIX',
            title: 'Find collaborators by sound',
            text: 'Discover artists and producers by genre, style, feel, and the parts they add best.',
          },
          {
            icon: 'GO',
            title: 'Turn demos into motion',
            text: 'Give the demos sitting on your hard drive a place to find new ears, new parts, and a reason to keep going.',
          },
          {
            icon: '+',
            title: 'Build first, organize later',
            text: 'Stay in the jam. Post daily ideas, add takes, and let organization follow the music instead of interrupting it.',
          },
        ],
      },
      {
        blockType: 'community',
        eyebrow: 'Early community',
        heading: 'A home for people who hear what a song could become.',
        text:
          'Sterio is for the producer with a folder full of beats, the singer who writes one perfect hook, the bassist who only needs one line to change the song, and the indie artist who wants a meaningful way to shoot their shot.',
        quote: 'The best take should have a chance to rise, even if it comes from someone nobody knew yet.',
        quoteAttribution: 'Sterio belief',
      },
      {
        blockType: 'cta',
        eyebrow: 'Ready when the idea hits',
        heading: 'Post the start. Find the next part.',
        text: 'Join Sterio and make collaboration feel more like jamming again.',
        buttonLabel: 'Start Creating Free',
        buttonHref: '/register',
        anchorId: 'join',
      },
    ],
  },
  {
    title: 'About',
    slug: 'about',
    status: 'published',
    seo: {
      metaTitle: 'About Sterio.fm — Built for Musicians, by Musicians',
      metaDescription:
        'Learn about the team behind Sterio.fm, why we built it, and our mission to make music collaboration as easy as it should be.',
      ogImage: '/marketing/duke-pfp.jpg',
      ogImageAlt: 'Duke, founder and creator of Sterio',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'About Sterio.fm',
        description: 'The story and team behind Sterio.fm, a music collaboration platform built by musicians.',
      },
    },
    layout: [
      {
        blockType: 'pageHero',
        eyebrow: 'Built from a real creative gap',
        headline: 'Music collaboration should start with inspiration, not setup.',
        subhead:
          'Duke created Sterio after watching music friendships drift apart, schedules stop lining up, and full hard drives of unfinished demos collect dust.',
      },
      {
        blockType: 'story',
        image: '/marketing/duke-pfp.jpg',
        imageAlt: 'Duke, founder and creator of Sterio',
        eyebrow: 'The origin story',
        heading: 'From high school sessions to a platform for open collaboration.',
        paragraphs: [
          {
            text: 'Duke played, wrote, and recorded music with his brother and a friend through high school and college. After college, everyone went separate ways, schedules got harder to line up, and the music slowed down.',
          },
          {
            text: 'They tried online collaborative DAWs, but the process always started with setup: create a project, organize the session, invite people in, then stare at a blank starting point with no spark.',
          },
          {
            text: 'At the same time, Duke had a hard drive full of unfinished song demos. He loved capturing the first idea more than building a full release identity every time with artwork, videos, rollout plans, and pressure.',
          },
          {
            text: 'Sterio was created to feel more like jamming: post the idea, let someone add the next part, and keep the music moving before inspiration disappears.',
          },
        ],
      },
      {
        blockType: 'cardGrid',
        eyebrow: 'What we believe',
        heading: 'Music first. Projects second.',
        variant: 'beliefs',
        softBackground: true,
        cards: [
          {
            title: 'Inspiration centered',
            text: 'The starting point is the sound, not the folder structure. Artists can post daily updates of ideas and let inspiration lead.',
          },
          {
            title: 'Anyone can shoot their shot',
            text: 'Indie artists should be able to reach bigger artists and new collaborators by adding something real, without asking for a huge commitment.',
          },
          {
            title: 'Open-source style music',
            text: 'Everyone brings a skill. A bassline, hook, drum pocket, verse, or texture can help a track become more alive.',
          },
          {
            title: 'Fun belongs in the process',
            text: 'No release identity required. No artwork or video pressure. Just the joy of recording ideas and seeing what other musicians hear in them.',
          },
        ],
      },
      {
        blockType: 'cardGrid',
        eyebrow: 'Team',
        heading: 'The people pushing Sterio forward.',
        variant: 'team',
        cards: [
          {
            title: 'Duke',
            role: 'Founder and creator of Sterio',
            text: 'Musician building the tool he wanted when friends, distance, and blank sessions got in the way.',
            image: '/marketing/duke-pfp.jpg',
            imageAlt: 'Duke profile photo',
          },
          {
            title: 'Chris',
            role: 'Marketing and creative strategy',
            text: 'Helps shape the story, audience, and creative direction so Sterio speaks like a real music platform.',
            image: '/marketing/chris-pfp.jpg',
            imageAlt: 'Chris profile photo',
          },
          {
            title: 'Rob $tone',
            role: 'Artist, collaborator, and creative partner',
            text: 'Brings the artist perspective and keeps the product tied to how musicians actually create.',
            image: '/marketing/rob-pfp.jpg',
            imageAlt: 'Rob Stone profile photo',
          },
        ],
      },
      {
        blockType: 'cta',
        eyebrow: 'Make something together',
        heading: 'Collab with anyone, anytime, anywhere.',
        text: 'Start with a sound. Let the best takes rise and give every musician a chance to be heard.',
        buttonLabel: 'Join Sterio',
        buttonHref: '/register',
      },
    ],
  },
  {
    title: 'Guides',
    slug: 'guides',
    status: 'published',
    seo: {
      metaTitle: 'Guides — Music Collaboration Tips, Tools & Strategies | Sterio.fm',
      metaDescription:
        'Practical guides for artists and producers on finding collaborators, building tracks remotely, and growing through music collaboration.',
      ogImage: '/marketing/duke-pfp.jpg',
      ogImageAlt: 'Sterio team profile image',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Sterio Guides',
        description: 'Guides for musicians on collaboration, remote music creation, and creative momentum.',
      },
    },
    layout: [
      {
        blockType: 'pageHero',
        eyebrow: 'Guides',
        headline: 'Practical music collaboration guides for artists and producers.',
        subhead:
          'Find better collaborators, keep long-distance sessions moving, and learn how to turn loose ideas into tracks that have a pulse.',
      },
      {
        blockType: 'cardGrid',
        heading: 'Browse practical guides for artists and producers.',
        variant: 'guides',
        cards: [
          {
            meta: 'Collaboration',
            title: 'How to Find a Music Producer to Collaborate With Online',
            text: 'Look for sound fit, communication style, and a low-friction way to trade ideas before you commit to a full project.',
            href: '/guides/find-producer',
            linkLabel: 'Read guide',
            featured: true,
          },
          {
            meta: 'Remote sessions',
            title: 'How to Start a Long-Distance Collab Without Losing Momentum',
            text: 'Keep the creative spark alive when nobody is in the same room.',
            href: '/guides/long-distance-collab',
            linkLabel: 'Read guide',
          },
          {
            meta: 'Tools',
            title: 'The Best Music Collaboration Platforms in 2026',
            text: 'How to compare platforms by creative speed, social discovery, and version flow.',
            href: '/register',
            linkLabel: 'Join for updates',
          },
          {
            meta: 'Feedback',
            title: 'How to Send Feedback on a Beat Without Killing the Vibe',
            text: 'Make suggestions that help the song move without flattening the person who made it.',
            href: '/register',
            linkLabel: 'Join for updates',
          },
          {
            meta: 'Collab basics',
            title: 'What Is Real-Time Music Collaboration and Why It Matters',
            text: 'A plain-language look at jamming online, async creation, and why timing changes everything.',
            href: '/register',
            linkLabel: 'Join for updates',
          },
          {
            meta: 'First sessions',
            title: 'How to Build a Track With Someone You\'ve Never Met',
            text: 'Start small, respond musically, and let trust form around the track itself.',
            href: '/register',
            linkLabel: 'Join for updates',
          },
        ],
      },
      {
        blockType: 'cta',
        eyebrow: 'Less waiting, more making',
        heading: 'Find your next collab by sharing the idea first.',
        buttonLabel: 'Find Your Next Collab',
        buttonHref: '/register',
      },
    ],
  },
  {
    title: 'How to Find a Music Producer to Collaborate With Online',
    slug: 'guides/find-producer',
    status: 'published',
    seo: {
      metaTitle: 'How to Find a Music Producer to Collaborate With Online | Sterio.fm',
      metaDescription:
        'A practical guide for artists looking for online music producers, with tips on sound fit, creative momentum, and collaboration etiquette.',
      ogImage: '/marketing/duke-pfp.jpg',
      ogImageAlt: 'Sterio guide for finding a producer online',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'How to Find a Music Producer to Collaborate With Online',
        description: 'A practical guide for artists looking for online music producers.',
        mainEntityOfPage: 'https://sterio.fm/guides/find-producer',
        author: { '@type': 'Organization', name: 'Sterio.fm' },
      },
    },
    layout: [
      {
        blockType: 'articleHeader',
        backHref: '/guides',
        backLabel: 'Back to Guides',
        meta: 'Collaboration',
        headline: 'How to Find a Music Producer to Collaborate With Online',
        intro:
          'Finding the right producer is less about chasing the biggest name and more about finding someone who can hear a next move in the idea you already have.',
      },
      {
        blockType: 'articleSections',
        sections: [
          {
            type: 'heading',
            heading: 'Start with sound fit',
          },
          {
            type: 'paragraph',
            text: 'Before you message anyone, listen for taste. Do their drums leave room for vocals? Do their chords support the kind of melodies you write? A strong fit usually feels obvious before anyone discusses splits, stems, or schedules.',
          },
          {
            type: 'heading',
            heading: 'Share a starter idea, not a giant brief',
          },
          {
            type: 'paragraph',
            text: 'A short hook, voice memo, loop, bassline, or rough chorus gives a producer something real to respond to. It also lets you see how they build on an idea instead of only talking about what they could do.',
          },
          {
            type: 'heading',
            heading: 'Look for musical replies',
          },
          {
            type: 'paragraph',
            text: 'The best early sign is a producer who can add momentum. Maybe they send a drum pocket, flip the chord movement, or make your rough vocal feel like a record. That first response tells you more than a perfect pitch deck.',
          },
          {
            type: 'heading',
            heading: 'Keep the first collab small',
          },
          {
            type: 'paragraph',
            text: 'Do one beat, one section, or one alternate version before you plan a whole release. Collaboration works best when trust grows around actual music.',
          },
          {
            type: 'callout',
            heading: 'Try it the Sterio way',
            text: 'Post the idea first. Let producers add their take. Choose the version that makes you want to finish the song.',
            buttonLabel: 'Add Your Take',
            buttonHref: '/register',
          },
        ],
      },
    ],
  },
  {
    title: 'How to Start a Long-Distance Collab Without Losing Momentum',
    slug: 'guides/long-distance-collab',
    status: 'published',
    seo: {
      metaTitle: 'How to Start a Long-Distance Collab Without Losing Momentum | Sterio.fm',
      metaDescription:
        'Learn how musicians can start remote collaborations with small ideas, clear next steps, and fast creative feedback.',
      ogImage: '/marketing/duke-pfp.jpg',
      ogImageAlt: 'Sterio guide for starting a long-distance music collaboration',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'How to Start a Long-Distance Collab Without Losing Momentum',
        description: 'A guide to keeping remote music collaboration moving.',
        mainEntityOfPage: 'https://sterio.fm/guides/long-distance-collab',
        author: { '@type': 'Organization', name: 'Sterio.fm' },
      },
    },
    layout: [
      {
        blockType: 'articleHeader',
        backHref: '/guides',
        backLabel: 'Back to Guides',
        meta: 'Remote sessions',
        headline: 'How to Start a Long-Distance Collab Without Losing Momentum',
        intro:
          'The hardest part of remote collaboration is not distance. It is letting the idea sit too long without a clear next move.',
      },
      {
        blockType: 'articleSections',
        sections: [
          { type: 'heading', heading: 'Begin with one playable idea' },
          {
            type: 'paragraph',
            text: 'Send something a collaborator can react to immediately: a chorus, drum loop, guitar riff, or rough bounce. A small idea with energy beats a perfect plan with no sound attached.',
          },
          { type: 'heading', heading: 'Name the next part' },
          {
            type: 'paragraph',
            text: 'Instead of asking "What do you think?" try "Can you add drums?" or "Do you hear a harmony here?" Clear invitations make it easier for people to jump in.',
          },
          { type: 'heading', heading: 'Keep versions visible' },
          {
            type: 'paragraph',
            text: 'Remote tracks lose steam when nobody knows which file is current. Keep every take connected to the original idea so the strongest path is easy to hear.',
          },
          { type: 'heading', heading: 'Respond while the spark is warm' },
          {
            type: 'paragraph',
            text: 'Fast does not mean rushed. It means you give the idea enough attention before everyone\'s creative brain moves on to the next thing.',
          },
          {
            type: 'callout',
            heading: 'Make distance feel less distant',
            text: 'Sterio turns each reply into a musical version, so the collaboration keeps feeling alive.',
            buttonLabel: 'Join Sterio',
            buttonHref: '/register',
          },
        ],
      },
    ],
  },
  {
    title: 'Sterio Plugin',
    slug: 'plugin',
    status: 'published',
    seo: {
      metaTitle: 'Sterio Plugin - DAW Collaboration for Artists & Producers | Sterio.fm',
      metaDescription:
        'Use the Sterio Plugin on an instrument or MIDI track to play stems from a Sterio track in sync with your DAW, record new parts with your own plugins, and collaborate without changing your production workflow.',
      ogImage: '/marketing/sterio-plugin-screenshot.png',
      ogImageAlt: 'Sterio Plugin loaded on an instrument track inside a DAW',
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          '@id': 'https://sterio.fm/plugin#software',
          name: 'Sterio Plugin',
          url: 'https://sterio.fm/plugin',
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'macOS, Windows',
          description:
            'A DAW plugin that lets musicians play stems from a Sterio track in sync with their DAW and record new parts with their own production setup.',
          image: 'https://sterio.fm/marketing/sterio-plugin-screenshot.png',
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://sterio.fm/' },
            { '@type': 'ListItem', position: 2, name: 'Sterio Plugin', item: 'https://sterio.fm/plugin' },
          ],
        },
      ],
    },
    layout: [
      {
        blockType: 'pluginHero',
        eyebrow: 'Sterio Plugin',
        headline: 'Collaborate in Sterio without leaving your DAW.',
        subhead:
          'Play stems from a Sterio track in sync with your DAW\'s transport, record a new part with your own instruments and plugins, then bring that take back into the collab.',
        actions: [
          { label: 'Download Plugin', href: '#download', variant: 'primary' },
          { label: 'How It Works', href: '#how-plugin-works', variant: 'secondary' },
        ],
        image: '/marketing/sterio-plugin-screenshot.png',
        imageAlt:
          'Sterio Plugin loaded on an instrument MIDI track inside a DAW, with the Sterio plugin window open and a Sterio track loaded.',
        caption: 'load Sterio on an instrument or MIDI track, not an audio track.',
      },
      {
        blockType: 'steps',
        eyebrow: 'Why it exists',
        heading: 'For producers who want the social collab flow and their real studio setup.',
        subhead:
          'The Sterio app makes it easy to find the idea and the collaborator. The plugin lets you do the serious production work inside the DAW you already know.',
        anchorId: 'how-plugin-works',
        softBackground: true,
        steps: [
          {
            number: '01',
            title: 'Open a Sterio track',
            text: 'Choose a collaboration from Sterio and load its stems into the plugin.',
          },
          {
            number: '02',
            title: 'Load it on a MIDI track',
            text: 'Add Sterio to an instrument or MIDI track, then play the stems with your DAW transport so your new part lands in time.',
          },
          {
            number: '03',
            title: 'Record your take',
            text: 'Use your own synths, guitar chain, vocal presets, samplers, and mix tools.',
          },
        ],
      },
      {
        blockType: 'cardGrid',
        eyebrow: 'Downloads',
        heading: 'Choose the installer for your studio.',
        variant: 'downloads',
        cards: [
          {
            title: 'macOS',
            text: '.pkg installer for macOS. Compatible with major DAWs that support AU or VST3.',
            platform: 'macOS',
            buttonLabel: 'Download',
            buttonHref: `${pluginBase}/plugin/Sterio-Plugin.pkg`,
          },
          {
            title: 'Windows x64',
            text: 'Zip file containing the VST3 plugin and installation guide for Windows x64.',
            platform: 'Windows',
            buttonLabel: 'Download',
            buttonHref: `${pluginBase}/plugin/Sterio-Plugin-Windows-x64-VST3.zip`,
          },
        ],
      },
      {
        blockType: 'featureCards',
        eyebrow: 'Built for real sessions',
        heading: 'Keep the parts of your workflow that already feel good.',
        features: [
          {
            icon: 'DAW',
            title: 'Use your own DAW',
            text: 'Stay in Logic, Ableton, FL Studio, Reaper, Studio One, Cubase, or the setup you already trust.',
          },
          {
            icon: 'FX',
            title: 'Use your own plugins',
            text: 'Track with your favorite instruments, presets, vocal chains, amp sims, and mix tools.',
          },
          {
            icon: 'SYNC',
            title: 'Stay in time',
            text: 'Hear the Sterio stems locked to your session so the new take lines up naturally.',
          },
          {
            icon: 'TAKE',
            title: 'Bring it back to Sterio',
            text: 'Use the DAW for precision, then return to Sterio for discovery, versions, and collaboration.',
          },
        ],
      },
      {
        blockType: 'centeredActions',
        eyebrow: 'Need help?',
        heading: 'Get the plugin into your session.',
        text: 'Check the collaboration guides or contact support if installation, setup, or DAW routing gets in the way.',
        anchorId: 'plugin-help',
        actions: [
          { label: 'Documentation', href: '/guides', variant: 'secondary' },
          { label: 'Contact Support', href: 'mailto:hello@sterio.fm?subject=Sterio%20Plugin%20Support', variant: 'primary' },
        ],
      },
    ],
  },
];
