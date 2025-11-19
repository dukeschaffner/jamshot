'use client';
import { FaUsers, FaFolder, FaLock, FaChartLine } from 'react-icons/fa';
import LandingPage from '../shared/LandingPage';
import { TEAM_PRODUCT_VERSIONS } from '../../../shared/utils/subscription';

export default function TeamsLanding({ showBackButton = false, onBack }) {
  const features = [
    {
      icon: <FaUsers />,
      title: 'Collaborate with Your Team',
      description: 'Asynchronous and effortless collaboration. Invite team members and work together on tracks in a shared workspace.'
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
      description: 'Open any folder to see all tracks organized within it. Upload tracks directly to folders and keep your projects structured.'
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
      subtitle="Collaborate with your team on music projects. Asynchronous and effortless—share tracks, organize folders, and work together seamlessly."
      ctaText="Create Team"
      createRoute="/teams/create"
      showBackButton={showBackButton}
      onBack={onBack}
      features={features}
      screenshots={screenshots}
      planFilter={(plans) => plans.filter(([version]) => version !== TEAM_PRODUCT_VERSIONS.ENTERPRISE)}
    />
  );
}

