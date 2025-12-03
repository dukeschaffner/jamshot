'use client';
import { FaCampground, FaFolder, FaLock, FaChartLine, FaMusic, FaDownload } from 'react-icons/fa';
import LandingPage from '../shared/LandingPage';

export default function CampsLanding({ showBackButton = false, onBack }) {
  const features = [
    {
      icon: <FaMusic />,
      title: 'A New Approach to Collaborative Songwriting',
      description: 'Think social media, but instead of sharing text-based posts and comments, you can share your ideas or comments through music, leading to truly inspired and organic collaboration.'
    },
    {
      icon: <FaCampground />,
      title: 'Collaborate with Your Camp',
      description: 'Asynchronous and effortless collaboration. Invite camp members and work together on tracks in a shared workspace. All contributions are timestamped and credited to the contributor.'
    },
    {
      icon: <FaFolder />,
      title: 'Organize with Rooms',
      description: 'Create rooms to organize camp tracks and keep projects structured.'
    },
    {
      icon: <FaLock />,
      title: 'Private Camp Tracks',
      description: 'All camp tracks are private by default, visible only to camp members.'
    },
    {
      icon: <FaChartLine />,
      title: 'Shared Upload Pool',
      description: 'Camp members share upload limits, making collaboration seamless.'
    },
    {
      icon: <FaDownload />,
      title: 'Export Stems',
      description: 'When a track gains momentum, export the stems to use in your DAW to turn the idea into a full song.'
    }
  ];

  const screenshots = [
    {
      image: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/camp-beat-pool.png`,
      alt: 'Beat pool view showing available beats',
      title: 'Beat Pool',
      description: 'Upload beats to the beat pool to share with your camp. Other camp members can add their ideas to the beats that resonate with them.'
    },
    {
      image: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/camp-rooms.png`,
      alt: 'Camp rooms view showing organized project rooms',
      title: 'Organize Projects with Rooms',
      description: 'Create rooms to organize your camp\'s tracks by project, album, or any structure that works for your workflow.'
    },
    {
      image: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/camp-room.png`,
      alt: 'Inside a camp room showing tracks organized within a project',
      title: 'View Tracks in Context',
      description: 'Open any room to see all tracks organized within it. Upload tracks directly to rooms and keep your projects structured.'
    },
    {
      image: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/DAW-collaboration.png`,
      alt: 'Simple collaborative DAW interface showing multi-track recording and collaboration',
      title: 'Collaborate with the Simple DAW',
      description: 'Use our built-in DAW to record, layer tracks, and collaborate asynchronously and effortlessly with your camp. Upload audio files or record directly, all within your camp workspace.'
    }
  ];

  // Camp-specific pricing (one-time payment for 7-day event)
  const campPlans = [
    {
      version: '10_users',
      name: 'Up to 10 Users',
      price: '$49',
      highlights: [
        'Up to 10 camp members',
        '7-day collaborative event',
        'Private tracks',
        'Camp Dashboard + Rooms',
        'Shared upload pool',
        'No ads'
      ]
    },
    {
      version: '25_users',
      name: 'Up to 25 Users',
      price: '$99',
      highlights: [
        'Up to 25 camp members',
        '7-day collaborative event',
        'Private tracks',
        'Camp Dashboard + Rooms',
        'Shared upload pool',
        'No ads'
      ]
    },
    {
      version: '50_users',
      name: 'Up to 50 Users',
      price: '$199',
      highlights: [
        'Up to 50 camp members',
        '7-day collaborative event',
        'Private tracks',
        'Camp Dashboard + Rooms',
        'Shared upload pool',
        'No ads'
      ]
    },
    {
      version: '100_users',
      name: 'Up to 100 Users',
      price: '$299',
      highlights: [
        'Up to 100 camp members',
        '7-day collaborative event',
        'Private tracks',
        'Camp Dashboard + Rooms',
        'Shared upload pool',
        'No ads'
      ]
    }
  ];

  return (
    <LandingPage
      title="Songwriting Camps"
      icon={FaCampground}
      subtitle="Streamline your collaborative writing process. Asynchronous and effortless—share tracks, organize rooms, and seamlessly build on each other's ideas."
      ctaText="Create Camp"
      createRoute="/camps/create"
      showBackButton={showBackButton}
      onBack={onBack}
      features={features}
      screenshots={screenshots}
      customPlans={campPlans}
      pricePeriod="one-time"
    />
  );
}

