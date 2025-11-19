'use client';
import { useRouter } from 'next/navigation';
import CampsLanding from '../../../components/camps/CampsLanding';
import sharedStyles from '../../../styles/Dashboard.module.css';

export default function CampsAboutPage() {
  const router = useRouter();

  const handleBack = () => {
    router.push('/camps');
  };

  return (
    <div className={sharedStyles.container}>
      <CampsLanding showBackButton={true} onBack={handleBack} />
    </div>
  );
}

