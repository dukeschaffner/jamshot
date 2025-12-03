'use client';
import { FaUsers, FaFolder, FaLock, FaChartLine, FaDownload, FaMusic } from 'react-icons/fa';
import LandingPage from '../shared/LandingPage';
import { TEAM_PRODUCT_VERSIONS } from '../../../shared/utils/subscription';

export default function TeamsLanding({ showBackButton = false, onBack }) {
  const features = [
    {
      icon: <FaMusic />,
      title: 'A New Approach to Collaborative Songwriting',
      description: 'Think social media, but instead of sharing text-based posts and comments, you can share your ideas or comments through music, leading to truly inspired and organic collaboration.'
    },
    {
      icon: <FaUsers />,
      title: 'Invite Your Team',
      description: 'Invite your team members to asynchronously collaborate on tracks in a shared workspace. All contributions are timestamped and credited to the contributor.'
    },
    {
      icon: <FaFolder />,
      title: 'Organize with Folders',
      description: 'Create folders to organize team tracks and keep projects structured.'
    },
    {
      icon: <FaLock />,
      title: 'Private Team Tracks',
      description: 'All team tracks are private by default, visible only to team members.'
    },
    {
      icon: <FaChartLine />,
      title: 'Shared Upload Pool',
      description: 'Team members share upload limits, making collaboration seamless.'
    },
    {
      icon: <FaDownload />,
      title: 'Export Stems',
      description: 'When a track gains momentum, export the stems to use in your DAW to turn the idea into a full song.'
    }
  ];

  const screenshots = [
    {
      image: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/team-folders.png`,
      alt: 'Team folders view showing organized project folders',
      title: 'Organize Projects with Folders',
      description: 'Create folders to organize your team\'s tracks by project, album, or any structure that works for your workflow.'
    },
    {
      image: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/team-folder.png`,
      alt: 'Inside a team folder showing tracks organized within a project',
      title: 'View Tracks in Context',
      description: 'Open any folder to see all tracks organized within it. Expand any track to see all its collaborators and their contributions. Upload tracks directly to folders and keep your projects structured.'
    },
    {
      image: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/DAW-collaboration.png`,
      alt: 'Simple collaborative DAW interface showing multi-track recording and collaboration',
      title: 'Collaborate with the Simple DAW',
      description: 'Use our built-in DAW to record, layer tracks, and collaborate asynchronously and effortlessly with your team. Upload audio files or record directly, all within your team workspace.'
    }
  ];

  return (
    <LandingPage
      title="Teams"
      icon={FaUsers}
      subtitle="Streamline your collaborative writing process. Asynchronous and effortless—share tracks, organize folders, and seamlessly build on each other's ideas."
      ctaText="Create Team"
      createRoute="/teams/create"
      showBackButton={showBackButton}
      onBack={onBack}
      features={features}
      screenshots={screenshots}
      planFilter={(plans) => plans.filter(([version]) => version !== TEAM_PRODUCT_VERSIONS.ENTERPRISE)}
      alternativeLink={{
        text: "Not looking for a monthly subscription? Need these features for a short time frame?",
        linkText: "Check out Songwriting Camps",
        href: "/camps/about"
      }}
    />
  );
}

