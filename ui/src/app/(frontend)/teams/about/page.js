'use client';
import { useRouter } from 'next/navigation';
import TeamsLanding from '@/components/teams/TeamsLanding';
import sharedStyles from '@/styles/Dashboard.module.css';

export default function TeamsAboutPage() {
  const router = useRouter();

  const handleBack = () => {
    router.push('/teams');
  };

  return (
    <div className={sharedStyles.container}>
      <TeamsLanding showBackButton={true} onBack={handleBack} />
    </div>
  );
}

